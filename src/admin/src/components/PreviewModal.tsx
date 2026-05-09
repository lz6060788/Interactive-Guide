import { useState, useEffect, useRef } from 'react'
import {
  Box, Flex, Text, Heading, Badge, Spinner, IconButton,
} from '@chakra-ui/react'
import { X, ArrowLeft } from 'lucide-react'
import * as api from '../services/api'
import type { PublishManifest, PublishHotspot } from '../../../shared/types'

interface Props {
  packageId: string
  onClose: () => void
}

type PlayerStatus = 'loading' | 'ready' | 'error'

export function PreviewModal({ packageId, onClose }: Props) {
  const [manifest, setManifest] = useState<PublishManifest | null>(null)
  const [currentNodeId, setCurrentNodeId] = useState('root')
  const [history, setHistory] = useState<string[]>([])
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setStatus('loading')
        let m: PublishManifest | null = null
        try {
          m = await api.fetchManifest(packageId) as PublishManifest
        } catch {
          m = await api.publishPackage(packageId) as PublishManifest
        }
        if (!m) throw new Error('无法加载 manifest')
        setManifest(m)
        setCurrentNodeId(m.rootNodeId)
        setStatus('ready')
      } catch (e: any) {
        setError(e.message)
        setStatus('error')
      }
    }
    load()
  }, [packageId])

  const currentNode = manifest ? manifest.nodeMap[currentNodeId] : null

  const handleHotspotClick = (hotspot: PublishHotspot) => {
    if (!manifest || transitioning) return
    const edge = manifest.edgeMap[hotspot.edgeId]

    // Push current node to history before navigating
    setHistory(prev => [...prev, currentNodeId])

    if (edge?.videoUrl) {
      setTransitioning(true)
      const video = videoRef.current
      if (video) {
        video.src = edge.videoUrl
        video.play().catch(() => switchNode(hotspot.targetNodeId))
        video.onended = () => switchNode(hotspot.targetNodeId)
      } else {
        switchNode(hotspot.targetNodeId)
      }
    } else {
      switchNode(hotspot.targetNodeId)
    }
  }

  const handleBack = () => {
    if (history.length === 0) return
    const prevNodeId = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))
    setCurrentNodeId(prevNodeId)
    setTransitioning(false)
  }

  const switchNode = (nodeId: string) => {
    setCurrentNodeId(nodeId)
    setTransitioning(false)
  }

  // Build breadcrumb path from root to current node
  const buildBreadcrumb = (m: PublishManifest, nodeId: string): { id: string; title: string }[] => {
    const path: { id: string; title: string }[] = [{ id: nodeId, title: m.nodeMap[nodeId]?.title ?? nodeId }]
    let current = nodeId
    while (current !== m.rootNodeId) {
      const edge = m.edges.find(e => e.toNodeId === current)
      if (!edge) break
      current = edge.fromNodeId
      path.unshift({ id: current, title: m.nodeMap[current]?.title ?? current })
    }
    return path
  }

  const breadcrumb = manifest ? buildBreadcrumb(manifest, currentNodeId) : []

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
        zIndex={1}
      >
        {/* Header */}
        <Flex align="center" gap="3" px="5" py="3" style={{ borderBottom: '1px solid #2a2d3a' }}>
          <Heading size="sm" fontWeight="600" color="text-primary">运行时预览</Heading>
          {history.length > 0 && (
            <IconButton size="sm" variant="ghost" color="text-secondary" onClick={handleBack} aria-label="后退">
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
                          setHistory(prev => [...prev, currentNodeId])
                          setCurrentNodeId(item.id)
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
        <Box flex="1" position="relative" bg="black" minH="400px" display="flex" alignItems="center" justifyContent="center" overflow="hidden">
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
              position="relative"
              style={{
                aspectRatio: `${manifest.resolution.width} / ${manifest.resolution.height}`,
                maxHeight: '90%',
                maxWidth: '100%',
              }}
            >
              {/* Node image fills the container */}
              <img
                src={currentNode.imageUrl}
                alt={currentNode.title}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />

              {/* Hotspot dots */}
              {currentNode.hotspots.map((hs) => (
                <Box
                  key={hs.edgeId}
                  as="button"
                  position="absolute"
                  left={`${hs.normalizedX * 100}%`}
                  top={`${hs.normalizedY * 100}%`}
                  w="24px"
                  h="24px"
                  rounded="full"
                  bg="whiteAlpha.900"
                  border="2px solid"
                  borderColor="whiteAlpha.600"
                  transform="translate(-50%, -50%)"
                  cursor="pointer"
                  zIndex={10}
                  p="0"
                  boxShadow="0 0 12px rgba(255,255,255,0.5)"
                  _hover={{ transform: 'translate(-50%, -50%) scale(1.2)' }}
                  onClick={() => handleHotspotClick(hs)}
                  title={hs.label}
                >
                  {/* Pulse ring */}
                  <Box
                    position="absolute"
                    inset="-4px"
                    rounded="full"
                    border="2px solid"
                    borderColor="whiteAlpha.300"
                    animation="pulse 2s ease-in-out infinite"
                  />
                </Box>
              ))}

              {/* Video overlay */}
              {transitioning && (
                <video
                  ref={videoRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 20 }}
                  muted
                  playsInline
                  onError={() => setTransitioning(false)}
                />
              )}

              {/* Title bar */}
              <Box
                position="absolute"
                bottom="0"
                left="0"
                right="0"
                p="5"
                bg="linear-gradient(transparent, blackAlpha.800)"
              >
                <Text color="white" fontSize="lg" fontWeight="600">
                  {currentNode.title}
                </Text>
                {currentNode.summary && (
                  <Text color="whiteAlpha.800" fontSize="sm" mt="1">
                    {currentNode.summary}
                  </Text>
                )}
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
