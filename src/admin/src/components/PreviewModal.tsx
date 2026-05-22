import { useState, useEffect, useRef } from 'react'
import {
  Box, Flex, Text, Spinner, IconButton,
} from '@chakra-ui/react'
import { X, ArrowLeft } from 'lucide-react'
import * as api from '../services/api'
import type { PublishManifest } from '../../../shared/types'
import { getResolutionAspectRatio } from '../../../shared/utils'
import { PlayerHost, type PlayerHostState } from '../../../runtime/player-core/player-host.js'

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

export function PreviewModal({ packageId, onClose }: Props) {
  const [manifest, setManifest] = useState<PublishManifest | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [runtimeState, setRuntimeState] = useState<PlayerHostState | null>(null)

  const hostRef = useRef<PlayerHost | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeImageRef = useRef<HTMLImageElement>(null)
  const nodeIframeRef = useRef<HTMLIFrameElement>(null)
  const hotspotsRef = useRef<HTMLDivElement>(null)

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
        setStatus('ready')
      } catch (e: any) {
        setError(e.message)
        setStatus('error')
      }
    }
    load()
  }, [packageId])

  // Phase 2: Create runtime host once DOM is mounted.
  useEffect(() => {
    if (status !== 'ready') return
    const m = manifest
    const viewport = viewportRef.current
    const stage = stageRef.current
    const container = containerRef.current
    const nodeImage = nodeImageRef.current
    const nodeIframe = nodeIframeRef.current
    const video = videoRef.current
    const hotspots = hotspotsRef.current
    if (!m || !viewport || !stage || !container || !nodeImage || !nodeIframe || !video || !hotspots) return

    const host = new PlayerHost({
      viewport,
      stage,
      container,
      nodeImage,
      nodeIframe,
      video,
      hotspots,
    }, {
      onStateChange: nextState => {
        setRuntimeState(nextState)
      },
    })
    hostRef.current = host
    host.loadManifest(m)

    return () => {
      host.destroy()
      hostRef.current = null
    }
  }, [status, manifest])

  useEffect(() => {
    if (status !== 'ready' || !manifest) return
    const host = hostRef.current
    const viewport = viewportRef.current
    const stage = stageRef.current
    const container = containerRef.current
    const nodeImage = nodeImageRef.current
    const nodeIframe = nodeIframeRef.current
    const video = videoRef.current
    const hotspots = hotspotsRef.current
    if (!host || !viewport || !stage || !container || !nodeImage || !nodeIframe || !video || !hotspots) return

    host.updateRefs({
      viewport,
      stage,
      container,
      nodeImage,
      nodeIframe,
      video,
      hotspots,
    })
  }, [status, manifest])

  // Compute modal sizing: fit resolution into 90vw x 90vh, keeping aspect ratio
  const maxWVw = 90
  const maxHVh = 90
  const ar = manifest
    ? getResolutionAspectRatio(manifest.resolution)
    : 16 / 9
  const modalW = `min(${maxWVw}vw, ${maxHVh}vh * ${ar})`
  const modalH = `min(${maxHVh}vh, ${maxWVw}vw / ${ar})`
  const preloading = runtimeState?.preloading ?? false
  const currentHistory = runtimeState?.history ?? []
  const currentNode = runtimeState?.currentNode ?? null

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
            onClick={() => hostRef.current?.handleBack()}
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
          {status === 'ready' && manifest && (
            <Box
              ref={viewportRef}
              w="100%"
              h="100%"
              minH="0"
              position="relative"
              overflow="hidden"
              bg="black"
            >
              <Box
                ref={stageRef}
                position="absolute"
                overflow="hidden"
                bg="black"
              >
                <Box
                  ref={containerRef}
                  position="absolute"
                  inset="0"
                  overflow="hidden"
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

                <img
                  ref={nodeImageRef}
                  alt=""
                />

                <iframe
                  ref={nodeIframeRef}
                  sandbox="allow-scripts allow-same-origin"
                />

                <Box ref={hotspotsRef} />

                <video
                  ref={videoRef}
                  muted
                  playsInline
                />
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Flex>
  )
}
