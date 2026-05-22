import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Box, Flex, Text, Heading, Button, Badge, IconButton, VStack,
} from '@chakra-ui/react'
import { X, Save } from 'lucide-react'

interface DraftHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  normalizedX: number
  normalizedY: number
  radius?: number
  style?: string
}

interface Props {
  node: any
  packageId: string
  onClose: () => void
  onSave: (hotspots: DraftHotspot[]) => void
  saving: boolean
}

export function HotspotEditorModal({ node, onClose, onSave, saving }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 })

  const updateImgRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const img = container.querySelector('img') as HTMLImageElement | null
    if (!img) return

    // Use the browser's actual rendered image box instead of re-deriving object-fit math.
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
    const timer = setTimeout(updateImgRect, 100)
    window.addEventListener('resize', updateImgRect)
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateImgRect) }
  }, [updateImgRect])

  const [drafts, setDrafts] = useState<DraftHotspot[]>(
    (node.hotspots ?? []).map((hs: any) => ({
      edgeId: hs.edgeId,
      targetNodeId: hs.targetNodeId,
      label: hs.label,
      normalizedX: hs.normalizedX,
      normalizedY: hs.normalizedY,
      radius: hs.radius,
      style: hs.style ?? '',
    })),
  )
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const getPosition = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container || imgRect.w === 0) return { x: 0, y: 0 }
    const cRect = container.getBoundingClientRect()
    const relX = e.clientX - cRect.left - imgRect.x
    const relY = e.clientY - cRect.top - imgRect.y
    return {
      x: Math.max(0, Math.min(1, relX / imgRect.w)),
      y: Math.max(0, Math.min(1, relY / imgRect.h)),
    }
  }, [imgRect])

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveIndex(index)
    setDragging(true)
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || activeIndex === null) return
      const pos = getPosition(e)
      setDrafts((prev) => {
        const next = [...prev]
        next[activeIndex] = { ...next[activeIndex], normalizedX: pos.x, normalizedY: pos.y }
        return next
      })
    },
    [dragging, activeIndex, getPosition],
  )

  const handleMouseUp = useCallback(() => { setDragging(false) }, [])

  const updateDraft = useCallback((index: number, patch: Partial<DraftHotspot>) => {
    setDrafts(prev => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }, [])

  useEffect(() => {
    if (dragging) {
      const up = () => setDragging(false)
      window.addEventListener('mouseup', up)
      return () => window.removeEventListener('mouseup', up)
    }
  }, [dragging])

  return (
    <Flex position="fixed" inset="0" zIndex={200} align="center" justify="center">
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.800" onClick={onClose} />

      {/* Modal */}
      <Box
        position="relative"
        w="95vw"
        maxW="1400px"
        maxH="90vh"
        bg="surface"
        rounded="lg"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        zIndex={1}
      >
        {/* Header */}
        <Flex align="center" justify="space-between" px="5" py="3" style={{ borderBottom: '1px solid #2a2d3a' }}>
          <Heading size="sm" fontWeight="600" color="text-primary">
            热点校准: {node.title}
          </Heading>
          <Flex gap="2">
            <Button
              size="sm"
              bg="brand"
              color="white"
              _hover={{ bg: 'brand-hover' }}
              onClick={() => onSave(drafts)}
              isLoading={saving}
            >
              <Save size={14} style={{ marginRight: 6 }} />
              保存校准结果
            </Button>
            <IconButton size="sm" variant="ghost" color="text-secondary" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </IconButton>
          </Flex>
        </Flex>

        {/* Main area */}
        <Flex flex="1" overflow="hidden">
          {/* Image stage */}
          <Box
            flex="1"
            position="relative"
            bg="black"
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            minH="400px"
            cursor={dragging ? 'grabbing' : 'default'}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <Box 
              ref={containerRef} 
              position="relative" 
              h="100%" 
              maxH="100%" 
              display="flex" 
              alignItems="center" 
              justifyContent="center"
            >
              {node.imageUrl ? (
                <img
                  src={node.imageUrl}
                  alt={node.title}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', userSelect: 'none' }}
                  draggable={false}
                  onLoad={updateImgRect}
                />
              ) : (
                <Text color="text-secondary" fontSize="md">无图片</Text>
              )}

              {/* Hotspot overlay — positioned exactly over the image content area */}
              {imgRect.w > 0 && (
                <Box
                  position="absolute"
                  left={`${imgRect.x}px`}
                  top={`${imgRect.y}px`}
                  width={`${imgRect.w}px`}
                  height={`${imgRect.h}px`}
                  pointerEvents="none"
                >
                  {drafts.map((hs, i) => (
                    <Box
                      key={hs.edgeId}
                      position="absolute"
                      left={`${hs.normalizedX * 100}%`}
                      top={`${hs.normalizedY * 100}%`}
                      minW="80px"
                      h="28px"
                      px="10px"
                      rounded="6px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="12px"
                      fontWeight="400"
                      color="rgba(0,0,0,0.84)"
                      userSelect="none"
                      transition="box-shadow 0.15s, border-color 0.15s"
                      cursor={dragging && activeIndex === i ? 'grabbing' : 'grab'}
                      pointerEvents="auto"
                      zIndex={activeIndex === i ? 10 : 5}
                      bg="rgba(255,255,255,0.92)"
                      border={activeIndex === i ? '1px solid #6366f1' : '1px solid #000000'}
                      boxShadow={activeIndex === i ? '0 8px 18px rgba(99,102,241,0.28)' : '0 8px 18px rgba(0,0,0,0.18)'}
                      transform="translate(-50%, -50%)"
                      onMouseDown={(e: any) => handleMouseDown(i, e)}
                      title={`${hs.label} → ${hs.targetNodeId}`}
                    >
                      <Text fontSize="12px" color="rgba(0,0,0,0.84)" noOfLines={1}>
                        {hs.label}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {/* Side panel */}
          <Box w="280px" style={{ borderLeft: '1px solid #2a2d3a' }} overflow="auto" p="4" flexShrink={0}>
            <Text fontSize="2xs" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
              热点列表
            </Text>
            {drafts.map((hs, i) => (
              <Box
                key={hs.edgeId}
                p="3"
                rounded="md"
                mb="2"
                cursor="pointer"
                style={{ border: `1px solid ${activeIndex === i ? '#6366f1' : '#2a2d3a'}` }}
                transition="border-color 0.15s"
                _hover={{ style: { border: '1px solid #6366f1' } }}
                onClick={() => setActiveIndex(i)}
              >
                <Flex align="center" gap="2" mb="1">
                  <Flex
                    w="20px"
                    h="20px"
                    rounded="full"
                    bg="brand"
                    color="white"
                    align="center"
                    justify="center"
                    fontSize="2xs"
                    fontWeight="700"
                    flexShrink={0}
                  >
                    {i + 1}
                  </Flex>
                  <Text fontWeight="500" fontSize="sm" color="text-primary">{hs.label}</Text>
                </Flex>
                <Text fontSize="2xs" color="text-tertiary" ml="7">目标: {hs.targetNodeId}</Text>
                <Text fontSize="2xs" color="text-tertiary" ml="7">
                  位置: ({hs.normalizedX.toFixed(3)}, {hs.normalizedY.toFixed(3)})
                </Text>
              </Box>
            ))}
            {activeIndex !== null && drafts[activeIndex] && (
              <Box mt="4" pt="4" style={{ borderTop: '1px solid #2a2d3a' }}>
                <Text fontSize="2xs" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
                  当前热点配置
                </Text>
                <Text fontSize="xs" color="text-tertiary" mb="1.5">显示文案</Text>
                <input
                  type="text"
                  value={drafts[activeIndex].label}
                  onChange={(e) => updateDraft(activeIndex, { label: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0a0b0f',
                    border: '1px solid #2a2d3a',
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '13px',
                    padding: '8px 12px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Text fontSize="xs" color="text-tertiary" mt="3" mb="1.5">自定义样式字符串</Text>
                <textarea
                  value={drafts[activeIndex].style ?? ''}
                  onChange={(e) => updateDraft(activeIndex, { style: e.target.value })}
                  rows={6}
                  placeholder="例如: background:#111;color:#fff;border:none;min-width:120px;"
                  style={{
                    width: '100%',
                    background: '#0a0b0f',
                    border: '1px solid #2a2d3a',
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '13px',
                    padding: '8px 12px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  }}
                />
              </Box>
            )}
            {drafts.length === 0 && (
              <Text color="text-tertiary" fontSize="sm" textAlign="center" py="5">
                当前节点没有热点
              </Text>
            )}
          </Box>
        </Flex>
      </Box>
    </Flex>
  )
}
