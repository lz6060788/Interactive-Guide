import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import {
  Box, Flex, Text, Spinner, IconButton,
} from '@chakra-ui/react'
import { X, ArrowLeft } from 'lucide-react'
import * as api from '../services/api'
import type { PublishManifest, ImageFitMode } from '../../../shared/types'
import { getResolutionAspectRatio, getResolutionAspectRatioCss } from '../../../shared/utils'
import { PlayerCore } from '../../../runtime/player-core/player-core.js'

interface Props {
  packageId: string
  onClose: () => void
}

type PlayerStatus = 'loading' | 'ready' | 'error'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_COUNT = 45

function isPublishManifest(value: unknown): value is PublishManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<PublishManifest>
  return (
    typeof manifest.packageId === 'string' &&
    typeof manifest.rootNodeId === 'string' &&
    Array.isArray(manifest.nodes) &&
    Array.isArray(manifest.edges) &&
    !!manifest.nodeMap &&
    !!manifest.edgeMap
  )
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function toAbsoluteUrl(url: string) {
  return new URL(url, window.location.href).href
}

function captureElementVisualSnapshot(el: HTMLElement | null) {
  if (!el) return null

  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)

  return {
    rect: {
      x: Number(rect.x.toFixed(2)),
      y: Number(rect.y.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    },
    style: {
      width: style.width,
      height: style.height,
      display: style.display,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      transform: style.transform,
      transformOrigin: style.transformOrigin,
      opacity: style.opacity,
      borderRadius: style.borderRadius,
    },
  }
}

export function PreviewModal({ packageId, onClose }: Props) {
  const [manifest, setManifest] = useState<PublishManifest | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 })

  // Image fit mode drag state
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  })
  const imageOffsetRef = useRef({ x: 0, y: 0 })

  // Re-render trigger synced from PlayerCore engine events
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  const engineRef = useRef<PlayerCore | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeImageRef = useRef<HTMLImageElement>(null)
  const nodeIframeRef = useRef<HTMLIFrameElement>(null)
  const manifestRef = useRef<PublishManifest | null>(null)

  // Read live state from engine
  const engine = engineRef.current
  const currentNodeId = engine?.getCurrentNodeId() ?? manifest?.rootNodeId ?? 'root'
  const transitioning = engine?.isTransitioning() ?? false
  const preloading = engine?.isPreloading() ?? false
  const currentHistory = engine?.getHistory() ?? []
  const currentNode = manifest?.nodeMap?.[currentNodeId] ?? null
  const imageFitMode: ImageFitMode = (currentNode as any)?.imageFitMode || 'fill'

  const confirmHostVisualCommitIfReady = useCallback((reason: string) => {
    const liveEngine = engineRef.current
    const img = nodeImageRef.current
    const iframe = nodeIframeRef.current
    const container = containerRef.current
    const liveNode = liveEngine?.getCurrentNode()
    if (!liveEngine || !container || !liveNode) return

    const pendingKind = liveEngine.getPendingVisualCommitKind()
    if (liveEngine.isTransitioning() && !pendingKind) return
    if (pendingKind === 'builtin' && reason !== 'node-image:onLoad:next-frame') {
      return
    }

    // HTML node: check iframe src instead of image
    if (liveNode.contentType === 'html') {
      if (!iframe) return
      const expectedSrc = toAbsoluteUrl(liveNode.htmlUrl ?? '')
      const actualSrc = iframe.src
      if (actualSrc !== expectedSrc) return
    } else {
      if (!img) return
      const expectedSrc = toAbsoluteUrl(liveNode.imageUrl ?? '')
      const actualSrc = img.currentSrc || img.src
      const liveNodeId = liveEngine.getCurrentNodeId()

      if (!img.complete || actualSrc !== expectedSrc) {
        return
      }

      if (pendingKind === 'builtin') {
        const frozenFrame = container.querySelector('[data-builtin-frozen-frame="true"]') as HTMLElement | null
        console.log('[PreviewModal][builtin-handoff]', {
          reason,
          currentNodeId: liveNodeId,
          expectedSrc,
          actualSrc,
          frozenFrame: captureElementVisualSnapshot(frozenFrame),
          nodeImage: captureElementVisualSnapshot(img),
        })
      }
    }

    liveEngine.confirmHostVisualCommitted()
  }, [])

  const updateImgRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const img = nodeImageRef.current
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return

    const cRect = container.getBoundingClientRect()
    const iRect = img.getBoundingClientRect()

    setImgRect({
      x: iRect.left - cRect.left,
      y: iRect.top - cRect.top,
      w: iRect.width,
      h: iRect.height,
    })
  }, [])

  const applyImageTransform = useCallback((offsetX: number, offsetY: number) => {
    const img = nodeImageRef.current
    if (!img) return

    const nextX = imageFitMode === 'fitHeight' ? offsetX : 0
    const nextY = imageFitMode === 'fitWidth' ? offsetY : 0
    imageOffsetRef.current = { x: nextX, y: nextY }
    img.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`
  }, [imageFitMode])

  useEffect(() => {
    if (status !== 'ready') return
    const timer = setTimeout(updateImgRect, 100)
    window.addEventListener('resize', updateImgRect)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateImgRect)
    }
  }, [status, currentNodeId, updateImgRect])

  // Image drag handler for fitHeight/fitWidth modes
  const handleImgMouseDown = useCallback((e: React.MouseEvent) => {
    if (imageFitMode === 'fill') return
    const img = nodeImageRef.current
    if (!img) return
    e.preventDefault()

    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: imageOffsetRef.current.x,
      startOffsetY: imageOffsetRef.current.y,
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return
      const container = containerRef.current
      const liveImg = nodeImageRef.current
      if (!container || !liveImg) return

      const cRect = container.getBoundingClientRect()
      const iRect = liveImg.getBoundingClientRect()

      let nextX = dragRef.current.startOffsetX
      let nextY = dragRef.current.startOffsetY

      if (imageFitMode === 'fitHeight') {
        nextX += ev.clientX - dragRef.current.startX
        if (iRect.width > cRect.width) {
          const maxOffsetX = (iRect.width - cRect.width) / 2
          nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX))
        } else {
          nextX = 0
        }
        nextY = 0
      } else if (imageFitMode === 'fitWidth') {
        nextY += ev.clientY - dragRef.current.startY
        if (iRect.height > cRect.height) {
          const maxOffsetY = (iRect.height - cRect.height) / 2
          nextY = Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY))
        } else {
          nextY = 0
        }
        nextX = 0
      }

      applyImageTransform(nextX, nextY)
      requestAnimationFrame(updateImgRect)
    }

    const handleMouseUp = () => {
      dragRef.current.active = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [applyImageTransform, imageFitMode, updateImgRect])

  useEffect(() => {
    imageOffsetRef.current = { x: 0, y: 0 }
    if (imageFitMode === 'fill') return

    requestAnimationFrame(() => {
      applyImageTransform(0, 0)
      updateImgRect()
    })
  }, [applyImageTransform, imageFitMode, currentNodeId, updateImgRect])

  // Phase 1: Load manifest
  useEffect(() => {
    const load = async () => {
      try {
        setStatus('loading')
        setError(null)

        let m: PublishManifest | null = null
        try {
          const manifest = await api.fetchManifest(`${packageId}?t=${Date.now()}`)
          if (isPublishManifest(manifest)) {
            m = manifest
          }
        } catch {
          // Fall through to rebuild/publish below.
        }

        if (!m) {
          const build = await api.publishPackage(packageId) as { buildId?: string }
          if (!build?.buildId) {
            throw new Error('未获取到可用的发布任务，无法预览')
          }

          let buildFinished = false;
          for (let i = 0; i < MAX_POLL_COUNT; i += 1) {
            const record = await api.fetchGenerate(build.buildId) as { status?: string }
            if (record?.status === 'failed') {
              throw new Error('生成失败，无法加载预览')
            }
            if (record?.status === 'success' || record?.status === 'partial_failed') {
              buildFinished = true;
              break;
            }
            await sleep(POLL_INTERVAL_MS)
          }

          if (buildFinished) {
            const manifest = await api.fetchManifest(`${packageId}?t=${Date.now()}`)
            if (isPublishManifest(manifest)) {
              m = manifest
            }
          }
        }

        if (!m) throw new Error('无法加载 manifest')

        setManifest(m)
        manifestRef.current = m
        setStatus('ready')
      } catch (e: any) {
        setError(e.message)
        setStatus('error')
      }
    }
    load()
  }, [packageId])

  // Phase 2: Create engine once DOM is mounted (after status === 'ready' render)
  useEffect(() => {
    if (status !== 'ready') return
    const m = manifestRef.current
    const container = containerRef.current
    const nodeImage = nodeImageRef.current
    const video = videoRef.current
    if (!m || !container || !nodeImage || !video) return

    const engine = new PlayerCore({
      container,
      nodeImage,
      video,
      nodeIframe: nodeIframeRef.current ?? undefined,
    })
    engineRef.current = engine
    engine.on('stateChange', () => {
      forceUpdate()
      requestAnimationFrame(() => {
        confirmHostVisualCommitIfReady('engine:stateChange:next-frame')
      })
    })
    engine.loadManifest(m)

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [status, confirmHostVisualCommitIfReady])

  useEffect(() => {
    if (status !== 'ready') return
    const engine = engineRef.current
    const container = containerRef.current
    const nodeImage = nodeImageRef.current
    const video = videoRef.current
    if (!engine || !container || !nodeImage || !video) return

    engine.updateRefs({
      container,
      nodeImage,
      video,
      nodeIframe: nodeIframeRef.current ?? undefined,
    })
  }, [status, currentNodeId, imageFitMode])

  // Listen for postMessage from HTML node iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'hotspot-click' && event.data?.edgeId) {
        engineRef.current?.handleHotspotById(event.data.edgeId)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !currentNode) return
    requestAnimationFrame(() => {
      confirmHostVisualCommitIfReady('render:next-frame')
    })
  }, [status, currentNode, currentNodeId, transitioning, confirmHostVisualCommitIfReady])

  // Compute modal sizing: fit resolution into 90vw x 90vh, keeping aspect ratio
  const maxWVw = 90
  const maxHVh = 90
  const ar = manifest
    ? getResolutionAspectRatio(manifest.resolution)
    : 16 / 9
  const stageAspectRatio = manifest
    ? getResolutionAspectRatioCss(manifest.resolution)
    : '16 / 9'
  // In vw/vh units: maxWVw vw / maxHVh vh = maxWVw / maxHVh (ratio depends on viewport aspect)
  // We need to fit a rect of aspect arW:arH into maxWVw x maxHVh.
  // Constraint: w <= maxWVw, h <= maxHVh, w/h = arW/arH
  // If maxWVw / ar <= maxHVh → constraining dim is width → w = maxWVw, h = maxWVw / ar
  // Else → constraining dim is height → h = maxHVh, w = maxHVh * ar
  const modalW = `min(${maxWVw}vw, ${maxHVh}vh * ${ar})`
  const modalH = `min(${maxHVh}vh, ${maxWVw}vw / ${ar})`

  // Image style based on fit mode
  const imgStyle: React.CSSProperties = imageFitMode === 'fill'
    ? {
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        display: currentNode?.contentType === 'html' ? 'none' : 'block',
        userSelect: 'none',
        opacity: transitioning ? 0 : 1,
      }
    : {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'none',
        maxHeight: 'none',
        ...(imageFitMode === 'fitHeight'
          ? { height: '100%', width: 'auto', cursor: 'grab' }
          : { width: '100%', height: 'auto', cursor: 'grab' }),
        display: currentNode?.contentType === 'html' ? 'none' : 'block',
        userSelect: 'none',
        opacity: transitioning ? 0 : 1,
      }

  return (
    <Flex position="fixed" inset="0" zIndex={200} align="center" justify="center">
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.800" onClick={onClose} />

      {/* Modal */}
      <Box
        position="relative"
        bg="black"
        rounded="lg"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        zIndex={1}
        style={manifest ? {
          width: modalW,
          height: modalH,
        } : { width: '90vw', height: '85vh' }}
      >
        {/* Floating close button */}
        <IconButton
          position="absolute"
          top="2"
          right="2"
          size="sm"
          variant="ghost"
          color="whiteAlpha.800"
          bg="blackAlpha.600"
          _hover={{ bg: 'blackAlpha.800' }}
          zIndex={20}
          rounded="full"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={16} />
        </IconButton>

        {/* Floating back button */}
        {currentHistory.length > 0 && (
          <IconButton
            position="absolute"
            top="2"
            left="2"
            size="sm"
            variant="ghost"
            color="whiteAlpha.800"
            bg="blackAlpha.600"
            _hover={{ bg: 'blackAlpha.800' }}
            zIndex={20}
            rounded="full"
            onClick={() => engine?.handleBack()}
            aria-label="后退"
          >
            <ArrowLeft size={16} />
          </IconButton>
        )}

        {/* Player area */}
        <Box
          flex="1"
          minH="0"
          position="relative"
          bg="black"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          {status === 'loading' && (
            <Flex direction="column" align="center" gap="3">
              <Spinner color="brand" />
              <Text color="text-secondary" fontSize="sm">加载 manifest...</Text>
            </Flex>
          )}
          {status === 'error' && (
            <Text color="error" fontSize="md">{error}</Text>
          )}
          {status === 'ready' && currentNode && manifest && (
            <Box
              w="100%"
              h="100%"
              display="flex"
              alignItems="center"
              justifyContent="center"
              minH="0"
            >
              <Box
                ref={containerRef}
                position="relative"
                w="100%"
                h="100%"
                overflow={imageFitMode !== 'fill' ? 'hidden' : 'visible'}
                style={{
                  aspectRatio: stageAspectRatio,
                }}
              >
                {preloading && (
                  <Flex
                    position="absolute"
                    inset="0"
                    zIndex={30}
                    direction="column"
                    align="center"
                    justify="center"
                    gap="3"
                    bg="rgba(2, 3, 5, 0.82)"
                  >
                    <Spinner color="brand" />
                    <Text color="text-secondary" fontSize="sm">预加载运行时资源...</Text>
                  </Flex>
                )}

                {/* Node image */}
                {imageFitMode !== 'fill' ? (
                  <Box
                    position="absolute"
                    inset="0"
                    overflow="hidden"
                  >
                    <img
                      key={`${currentNodeId}-${imageFitMode}`}
                      ref={nodeImageRef}
                      src={currentNode.imageUrl}
                      alt={currentNode.title}
                      style={imgStyle}
                      onMouseDown={handleImgMouseDown}
                      onLoad={() => {
                        applyImageTransform(
                          imageOffsetRef.current.x,
                          imageOffsetRef.current.y,
                        )
                        updateImgRect()
                        requestAnimationFrame(() => {
                          confirmHostVisualCommitIfReady('node-image:onLoad:next-frame')
                        })
                      }}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement
                        img.style.display = 'none'
                      }}
                    />
                  </Box>
                ) : (
                  <img
                    key={`${currentNodeId}-${imageFitMode}`}
                    ref={nodeImageRef}
                    src={currentNode.imageUrl}
                    alt={currentNode.title}
                    style={imgStyle}
                    onLoad={() => {
                      updateImgRect()
                      requestAnimationFrame(() => {
                        confirmHostVisualCommitIfReady('node-image:onLoad:next-frame')
                      })
                    }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      img.style.display = 'none'
                    }}
                  />
                )}

                {/* Node iframe for HTML nodes */}
                <iframe
                  ref={nodeIframeRef}
                  src={currentNode.contentType === 'html' ? currentNode.htmlUrl : undefined}
                  sandbox="allow-scripts allow-same-origin"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: currentNode.contentType === 'html' ? 'block' : 'none',
                    opacity: transitioning ? 0 : 1,
                  }}
                  onLoad={() => {
                    requestAnimationFrame(() => {
                      confirmHostVisualCommitIfReady('node-iframe:onLoad:next-frame')
                    })
                  }}
                />

                {/* Hotspot overlay — positioned exactly over the image content area (hidden for HTML nodes) */}
                {imgRect.w > 0 && currentNode.contentType !== 'html' && (
                  <Box
                    position="absolute"
                    left={`${imgRect.x}px`}
                    top={`${imgRect.y}px`}
                    width={`${imgRect.w}px`}
                    height={`${imgRect.h}px`}
                    pointerEvents="none"
                    opacity={transitioning ? 0 : 1}
                    transition="opacity 180ms ease"
                  >
                    {(currentNode.hotspots ?? []).map((hs) => (
                      <Box
                        key={hs.edgeId}
                        as="button"
                        position="absolute"
                        left={`${hs.normalizedX * 100}%`}
                        top={`${hs.normalizedY * 100}%`}
                        w="28px"
                        h="28px"
                        rounded="full"
                        border="1px solid"
                        borderColor="rgba(255,255,255,0.86)"
                        background="radial-gradient(circle at 35% 35%, rgba(255,255,255,0.98) 0%, rgba(223,239,255,0.96) 36%, rgba(107,177,255,0.84) 70%, rgba(33,105,255,0.46) 100%)"
                        transform="translate(-50%, -50%)"
                        cursor="pointer"
                        pointerEvents="auto"
                        zIndex={10}
                        p="0"
                        boxShadow="0 0 12px rgba(131,194,255,0.7), 0 0 28px rgba(87,162,255,0.4), inset 0 0 10px rgba(255,255,255,0.88)"
                        _hover={{
                          transform: 'translate(-50%, -50%) scale(1.18)',
                          borderColor: 'rgba(202,233,255,0.98)',
                          background: 'radial-gradient(circle at 35% 35%, rgba(244,251,255,1) 0%, rgba(198,230,255,0.98) 30%, rgba(113,185,255,0.92) 62%, rgba(37,119,255,0.7) 100%)',
                          boxShadow: '0 0 18px rgba(137,208,255,0.9), 0 0 40px rgba(95,176,255,0.72), 0 0 72px rgba(49,128,255,0.42), inset 0 0 12px rgba(255,255,255,0.96)',
                          '& > .hotspot-outer-glow': {
                            inset: '-13px',
                            background: 'radial-gradient(circle, rgba(158,214,255,0.72) 0%, rgba(110,186,255,0.42) 38%, rgba(58,137,255,0.18) 68%, rgba(58,137,255,0) 100%)',
                          },
                        }}
                        onClick={() => engine?.handleHotspotClick(hs)}
                        title={hs.label}
                      >
                        <Box
                          position="absolute"
                          inset="5px"
                          rounded="full"
                          background="radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(214,238,255,0.94) 42%, rgba(148,206,255,0.2) 100%)"
                        />
                        <Box
                          className="hotspot-outer-glow"
                          position="absolute"
                          inset="-8px"
                          rounded="full"
                          background="radial-gradient(circle, rgba(118,184,255,0.55) 0%, rgba(82,156,255,0.28) 45%, rgba(48,124,255,0.08) 72%, rgba(48,124,255,0) 100%)"
                          animation="pulse 1.9s ease-in-out infinite"
                          transition="inset 180ms ease, background 180ms ease"
                        />
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Video overlay — always in DOM for PlayerCore ref access */}
                <video
                  ref={videoRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    zIndex: 20,
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                  muted
                  playsInline
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Flex>
  )
}
