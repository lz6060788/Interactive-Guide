import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import {
  Box, Flex, Text, Heading, Badge, Spinner, IconButton,
} from '@chakra-ui/react'
import { X, ArrowLeft } from 'lucide-react'
import * as api from '../services/api'
import type { PublishManifest } from '../../../shared/types'
import { PlayerCore } from '../../../runtime/player-core/player-core.js'

interface Props {
  packageId: string
  onClose: () => void
}

type PlayerStatus = 'loading' | 'ready' | 'error'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_COUNT = 45
const INFO_PANEL_COLLAPSED_PX = 52
const INFO_PANEL_EXPANDED_PX = 176

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
  const [infoExpanded, setInfoExpanded] = useState(false)
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 })

  // Re-render trigger synced from PlayerCore engine events
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  const engineRef = useRef<PlayerCore | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeImageRef = useRef<HTMLImageElement>(null)
  const nodeIframeRef = useRef<HTMLIFrameElement>(null)
  const manifestRef = useRef<PublishManifest | null>(null)

  const infoPanelHeight = infoExpanded ? INFO_PANEL_EXPANDED_PX : INFO_PANEL_COLLAPSED_PX

  // Read live state from engine
  const engine = engineRef.current
  const currentNodeId = engine?.getCurrentNodeId() ?? manifest?.rootNodeId ?? 'root'
  const transitioning = engine?.isTransitioning() ?? false
  const preloading = engine?.isPreloading() ?? false
  const currentHistory = engine?.getHistory() ?? []
  const currentNode = manifest?.nodeMap?.[currentNodeId] ?? null
  const breadcrumb = engine?.buildBreadcrumb() ?? []

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
    if (!img) return

    if (img.naturalWidth === 0 || img.naturalHeight === 0) return

    const cRect = container.getBoundingClientRect()
    const iRect = img.getBoundingClientRect()

    const renderX = iRect.left - cRect.left
    const renderY = iRect.top - cRect.top
    const renderW = iRect.width
    const renderH = iRect.height

    setImgRect({
      x: renderX,
      y: renderY,
      w: renderW,
      h: renderH,
    })
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    const timer = setTimeout(updateImgRect, 100)
    window.addEventListener('resize', updateImgRect)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateImgRect)
    }
  }, [status, currentNodeId, updateImgRect])

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
        setInfoExpanded(false)
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
      setInfoExpanded(false)
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

  return (
    <Flex position="fixed" inset="0" zIndex={200} align="center" justify="center">
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.800" onClick={onClose} />

      {/* Modal */}
      <Box
        position="relative"
        w="90vw"
        maxW="1200px"
        bg="surface"
        rounded="lg"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        maxH="90vh"
        h="90vh"
        zIndex={1}
      >
        {/* Header */}
        <Flex align="center" gap="3" px="5" py="3" style={{ borderBottom: '1px solid #2a2d3a' }}>
          <Heading size="sm" fontWeight="600" color="text-primary">运行时预览</Heading>
          {currentHistory.length > 0 && (
            <IconButton
              size="sm"
              variant="ghost"
              color="text-secondary"
              onClick={() => engine?.handleBack()}
              aria-label="后退"
            >
              <ArrowLeft size={16} />
            </IconButton>
          )}
          <Flex flex="1" gap="2" align="center" overflow="hidden">
            {manifest && (
              <Badge bg="surface-raised" color="text-secondary" fontSize="xs" px="2" py="0.5" rounded="sm" flexShrink={0}>
                {manifest.packageId} v{manifest.version}
              </Badge>
            )}
            {/* Breadcrumb */}
            {breadcrumb.length > 0 && (
              <Flex gap="1" align="center" overflow="hidden">
                {breadcrumb.map((item, i) => (
                  <Flex key={item.id} align="center" gap="1" flexShrink={0}>
                    {i > 0 && <Text color="text-tertiary" fontSize="xs">/</Text>}
                    <Text
                      as="button"
                      fontSize="xs"
                      color={i === breadcrumb.length - 1 ? 'text-primary' : 'text-secondary'}
                      fontWeight={i === breadcrumb.length - 1 ? '600' : '400'}
                      cursor="pointer"
                      _hover={{ textDecoration: 'underline' }}
                      onClick={() => {
                        if (i < breadcrumb.length - 1) {
                          engine?.navigateTo(item.id)
                        }
                      }}
                      whiteSpace="nowrap"
                    >
                      {item.title}
                    </Text>
                  </Flex>
                ))}
              </Flex>
            )}
          </Flex>
          <IconButton size="sm" variant="ghost" color="text-secondary" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </IconButton>
        </Flex>

        {/* Player */}
        <Box
          flex="1"
          minH="0"
          position="relative"
          bg="black"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          px={{ base: 3, md: 5 }}
          py={{ base: 3, md: 4 }}
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
                h={`calc(100% - ${INFO_PANEL_COLLAPSED_PX}px)`}
                maxH={`calc(100% - ${INFO_PANEL_COLLAPSED_PX}px)`}
                maxW="100%"
                overflow="visible"
                style={{
                  aspectRatio: `${manifest.resolution.width} / ${manifest.resolution.height}`,
                  margin: '0 auto',
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
                <img
                  ref={nodeImageRef}
                  src={currentNode.imageUrl}
                  alt={currentNode.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: currentNode.contentType === 'html' ? 'none' : 'block',
                    userSelect: 'none',
                    opacity: transitioning ? 0 : 1,
                  }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement
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

                <Box
                  position="absolute"
                  left="0"
                  right="0"
                  top="100%"
                  h={`${infoPanelHeight}px`}
                  overflow="hidden"
                  zIndex={15}
                  pointerEvents="auto"
                  transform={infoExpanded ? `translateY(-${INFO_PANEL_EXPANDED_PX - INFO_PANEL_COLLAPSED_PX}px)` : 'translateY(0)'}
                  transition="height 220ms ease, transform 220ms ease"
                  onMouseLeave={() => setInfoExpanded(false)}
                  style={{
                    backgroundColor: 'rgba(232, 235, 239, 0.2)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    borderTop: '1px solid rgba(255,255,255,0.28)',
                    boxShadow: '0 -10px 24px rgba(0,0,0,0.12)',
                  }}
                >
                  <Flex
                    align="center"
                    justify="space-between"
                    px="4"
                    h={`${INFO_PANEL_COLLAPSED_PX}px`}
                    flexShrink={0}
                    cursor="ns-resize"
                    onMouseEnter={() => setInfoExpanded(true)}
                    style={{
                      backgroundColor: 'rgba(240, 242, 245, 0.2)',
                      borderBottom: infoExpanded ? '1px solid rgba(120, 130, 140, 0.12)' : 'none',
                    }}
                  >
                    <Text
                      color="rgba(255,255,255,0.96)"
                      fontSize="sm"
                      fontWeight="600"
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      textShadow="0 1px 8px rgba(0,0,0,0.35)"
                    >
                      {currentNode.title}
                    </Text>
                    <Text fontSize="11px" color="rgba(255,255,255,0.78)" flexShrink={0} ml="3">
                      悬浮展开
                    </Text>
                  </Flex>

                  <Box
                    px="4"
                    pt="3"
                    pb="2"
                    overflow="hidden"
                    opacity={infoExpanded ? 1 : 0}
                    transition="opacity 180ms ease"
                  >
                    {currentNode.summary && (
                      <Text color="rgba(255,255,255,0.92)" fontSize="sm" lineHeight="1.55" textShadow="0 1px 8px rgba(0,0,0,0.35)">
                        {currentNode.summary}
                      </Text>
                    )}
                    {currentNode.keyPoints?.length > 0 && (
                      <Text color="rgba(255,255,255,0.82)" fontSize="xs" mt="2" lineHeight="1.7" textShadow="0 1px 8px rgba(0,0,0,0.35)">
                        {currentNode.keyPoints.slice(0, 3).map((item: string) => `• ${item}`).join('  ')}
                      </Text>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Flex justify="space-between" align="center" px="5" py="2.5" style={{ borderTop: '1px solid #2a2d3a' }}>
          <Text fontSize="xs" color="text-tertiary">
            点击白点热点切换到目标节点 · 支持转场视频播放
          </Text>
          {manifest && (
            <Text fontSize="xs" color="text-tertiary">
              {manifest.nodes.length} 节点 · {manifest.edges.length} 边
            </Text>
          )}
        </Flex>
      </Box>
    </Flex>
  )
}
