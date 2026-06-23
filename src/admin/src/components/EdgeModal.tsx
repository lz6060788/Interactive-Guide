import { useState, useEffect } from 'react'
import {
  Box, Flex, Text, Button, Heading, Badge,
  IconButton, VStack, HStack,
} from '@chakra-ui/react'
import { X, Save, RefreshCw } from 'lucide-react'
import { TransitionSelector, VideoTransitionForm, PanTransitionForm, FlipTransitionForm, ZoomTransitionForm, type TransitionOption } from './Edge/transitions'
import type { PanConfig, FlipConfig, ZoomConfig } from './Edge/transitions'

const BORDER = '#2a2d3a'

interface EdgeModalProps {
  pkg: any
  edgeId: string
  onClose: () => void
  onSave: (data: any) => void
  saving: boolean
  onRegenerateEdge?: (edgeId: string) => Promise<void>
}

function Field({ label, value, onChange, disabled, multiline, rows, mono }: {
  label: string
  value: string
  onChange?: (v: string) => void
  disabled?: boolean
  multiline?: boolean
  rows?: number
  mono?: boolean
}) {
  return (
    <Box mb="4">
      <Text fontSize="xs" fontWeight="500" color="text-tertiary" mb="1.5">
        {label}
      </Text>
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          disabled={disabled}
          rows={rows ?? 3}
          style={{
            width: '100%',
            background: '#0a0b0f',
            border: `1px solid ${BORDER}`,
            borderRadius: '6px',
            color: '#e4e4e7',
            fontSize: '13px',
            padding: '8px 12px',
            fontFamily: mono ? "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" : 'inherit',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          disabled={disabled}
          style={{
            width: '100%',
            background: '#0a0b0f',
            border: `1px solid ${BORDER}`,
            borderRadius: '6px',
            color: disabled ? '#5c5f77' : '#e4e4e7',
            fontSize: '13px',
            padding: '8px 12px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
    </Box>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const colorMap: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: '等待中' },
    success: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: '成功' },
    failed: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: '失败' },
    running: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: '运行中' },
    idle: { bg: 'rgba(92,95,119,0.12)', color: '#5c5f77', label: '空闲' },
    draft: { bg: 'rgba(92,95,119,0.12)', color: '#5c5f77', label: '草稿' },
    ready: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: '就绪' },
    archived: { bg: 'rgba(92,95,119,0.12)', color: '#5c5f77', label: '已归档' },
  }
  const c = colorMap[status ?? ''] ?? { bg: 'rgba(92,95,119,0.12)', color: '#5c5f77', label: status ?? '-' }
  return (
    <Badge bg={c.bg} color={c.color} fontSize="xs" px="2" py="0.5" rounded="sm">
      {c.label}
    </Badge>
  )
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <Button
      w="100%"
      mt="4"
      bg="brand"
      color="white"
      _hover={{ bg: 'brand-hover' }}
      onClick={onClick}
      loading={saving}
      size="sm"
    >
      <Save size={14} style={{ marginRight: 6 }} />
      保存
    </Button>
  )
}

export function EdgeModal({
  pkg,
  edgeId,
  onClose,
  onSave,
  saving,
  onRegenerateEdge,
}: EdgeModalProps) {
  const edge = pkg.edges.find((e: any) => e.id === edgeId)
  if (!edge) return null

  const fromNode = pkg.nodes.find((n: any) => n.id === edge.fromNodeId)
  const toNode = pkg.nodes.find((n: any) => n.id === edge.toNodeId)

  // Get hotspot position for zoom default
  const fromHotspot = edge.fromNodeId && fromNode?.hotspots?.find((hs: any) => hs.targetNodeId === edge.toNodeId)
  const hotspotX = fromHotspot?.normalizedX ?? 0.5
  const hotspotY = fromHotspot?.normalizedY ?? 0.5

  // Edge basic fields
  const [relationLabel, setRelationLabel] = useState(edge.relationLabel || '')
  const [transitionDescriptionMode, setTransitionDescriptionMode] = useState(edge.transitionDescriptionMode || 'auto')
  const [manualTransitionPrompt, setManualTransitionPrompt] = useState(edge.manualTransitionPrompt || '')

  // Video state (for legacy video transition)
  const [videoUrl, setVideoUrl] = useState(edge.videoUrl)
  // Transition type selection
  const [selectedTransition, setSelectedTransition] = useState<TransitionOption | null>(() => {
    if (edge.transitionType === 'builtin' && edge.builtinTransition) {
      return {
        type: 'builtin',
        builtinType: edge.builtinTransition.type as 'pan' | 'flip' | 'zoom',
        label: '',
        description: '',
      }
    }
    if (edge.transitionType === 'video' || edge.videoUrl) {
      return { type: 'video', label: '', description: '' }
    }
    return null
  })

  // Builtin transition configs
  const [panConfig, setPanConfig] = useState<PanConfig>({
    type: 'pan',
    direction: (edge.builtinTransition?.direction as PanConfig['direction']) || 'left',
    duration: edge.builtinTransition?.duration ?? 600,
    easing: (edge.builtinTransition?.easing as PanConfig['easing']) || 'ease-in-out',
  })

  const [flipConfig, setFlipConfig] = useState<FlipConfig>({
    type: 'flip',
    direction: (edge.builtinTransition?.direction as FlipConfig['direction']) || 'horizontal',
    flipStyle: (edge.builtinTransition as any)?.flipStyle || 'fade',
    duration: edge.builtinTransition?.duration ?? 600,
    easing: (edge.builtinTransition?.easing as FlipConfig['easing']) || 'ease-in-out',
  })

  const [zoomConfig, setZoomConfig] = useState<ZoomConfig>({
    type: 'zoom',
    direction: (edge.builtinTransition?.direction as ZoomConfig['direction']) || 'in',
    scale: (edge.builtinTransition as any)?.scale ?? 1.5,
    centerX: (edge.builtinTransition as any)?.centerX ?? hotspotX,
    centerY: (edge.builtinTransition as any)?.centerY ?? hotspotY,
    focusMode: (edge.builtinTransition as any)?.focusMode
      ?? ((edge.builtinTransition as any)?.focusQuad ? 'quad' : 'center'),
    focusQuad: (edge.builtinTransition as any)?.focusQuad,
    duration: edge.builtinTransition?.duration ?? 600,
    easing: (edge.builtinTransition?.easing as ZoomConfig['easing']) || 'ease-in-out',
  })

  const transitionPlan = edge.transitionPlan
  const strategyModeLabel =
    edge.transitionStrategyMode === 'element-bridge' ? '元素桥接' :
    edge.transitionStrategyMode === 'fallback-navigation' ? '兜底导览' :
    edge.transitionStrategyMode === 'manual-directed' ? '人工导演' :
    ''

  useEffect(() => { setVideoUrl(edge.videoUrl) }, [edge.videoUrl])

  const isManualMode = transitionDescriptionMode === 'manual'
  const hasTransitionDescription = Boolean(
    edge.transitionStrategyReason ||
    transitionPlan ||
    edge.transitionPrompt,
  )

  const handleVideoChange = (url: string) => {
    setVideoUrl(url)
  }

  const getBuiltinConfig = () => {
    if (!selectedTransition || selectedTransition.type !== 'builtin') return null
    switch (selectedTransition.builtinType) {
      case 'pan': return panConfig
      case 'flip': return flipConfig
      case 'zoom': return zoomConfig
      default: return null
    }
  }

  return (
    <Flex position="fixed" top="0" right="0" bottom="0" zIndex={100}>
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.500" onClick={onClose} />

      {/* Modal panel */}
      <Box
        position="relative"
        w="560px"
        maxW="90vw"
        bg="surface"
        style={{ borderLeft: `1px solid ${BORDER}` }}
        display="flex"
        flexDirection="column"
        zIndex={1}
      >
        {/* Header */}
        <Flex
          align="center"
          justify="space-between"
          px="5"
          py="4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <Heading size="sm" fontWeight="600" color="text-primary">
            边: {edge.relationLabel || edgeId}
          </Heading>
          <IconButton
            size="sm"
            variant="ghost"
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </IconButton>
        </Flex>

        {/* Body */}
        <Box flex="1" overflow="auto" p="5">
          {/* Basic info */}
          <Field label="ID" value={edge.id} disabled />
          <Field label="起始节点" value={edge.fromNodeId} disabled />
          <Field label="目标节点" value={edge.toNodeId} disabled />
          <Field label="关系文案" value={relationLabel} onChange={setRelationLabel} />

          {/* Transition Type Selection */}
          <Box mb="4">
            <TransitionSelector
              value={selectedTransition}
              onChange={setSelectedTransition}
            />
          </Box>

          {/* Transition Config Forms */}
          {selectedTransition?.type === 'video' && (
            <VideoTransitionForm
              guideId={pkg.id}
              edgeId={edge.id}
              videoUrl={videoUrl}
              onChange={handleVideoChange}
            />
          )}

          {selectedTransition?.type === 'builtin' && selectedTransition.builtinType === 'pan' && (
            <PanTransitionForm
              config={panConfig}
              onChange={setPanConfig}
              fromImageUrl={fromNode?.imageUrl}
              toImageUrl={toNode?.imageUrl}
            />
          )}

          {selectedTransition?.type === 'builtin' && selectedTransition.builtinType === 'flip' && (
            <FlipTransitionForm
              config={flipConfig}
              onChange={setFlipConfig}
              fromImageUrl={fromNode?.imageUrl}
              toImageUrl={toNode?.imageUrl}
            />
          )}

          {selectedTransition?.type === 'builtin' && selectedTransition.builtinType === 'zoom' && (
            <ZoomTransitionForm
              config={zoomConfig}
              onChange={setZoomConfig}
              fromImageUrl={fromNode?.imageUrl}
              toImageUrl={toNode?.imageUrl}
              hotspotX={hotspotX}
              hotspotY={hotspotY}
            />
          )}

          {/* Transition description mode (AI vs Manual) */}
          <Box mb="4" mt="4">
            <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
              转场描述模式
            </Text>
            <HStack gap="2" align="stretch">
              <Button
                flex="1"
                size="sm"
                variant="ghost"
                bg={!isManualMode ? 'rgba(59,130,246,0.14)' : 'rgba(92,95,119,0.08)'}
                color={!isManualMode ? '#7dd3fc' : 'text-secondary'}
                style={{ border: `1px solid ${!isManualMode ? 'rgba(59,130,246,0.45)' : BORDER}` }}
                _hover={{ bg: !isManualMode ? 'rgba(59,130,246,0.2)' : 'rgba(92,95,119,0.12)' }}
                onClick={() => setTransitionDescriptionMode('auto')}
              >
                AI 自动生成
              </Button>
              <Button
                flex="1"
                size="sm"
                variant="ghost"
                bg={isManualMode ? 'rgba(16,185,129,0.14)' : 'rgba(92,95,119,0.08)'}
                color={isManualMode ? '#6ee7b7' : 'text-secondary'}
                style={{ border: `1px solid ${isManualMode ? 'rgba(16,185,129,0.45)' : BORDER}` }}
                _hover={{ bg: isManualMode ? 'rgba(16,185,129,0.2)' : 'rgba(92,95,119,0.12)' }}
                onClick={() => setTransitionDescriptionMode('manual')}
              >
                手动设置
              </Button>
            </HStack>
            <Text fontSize="xs" color="text-tertiary" mt="2" px="1">
              {isManualMode
                ? '保存后重新生成转场时，将跳过 AI 转场规划，直接使用你编写的转场描述。'
                : '重新生成转场时，会调用 AI 自动规划转场描述。'}
            </Text>
          </Box>

          {isManualMode && (
            <Field
              label="手动转场描述"
              value={manualTransitionPrompt}
              onChange={setManualTransitionPrompt}
              multiline
              rows={8}
            />
          )}

          {/* Status badges */}
          {(edge.status || edge.promptStatus || edge.videoStatus) && (
            <Box mb="4">
              <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
                状态
              </Text>
              <Flex gap="4" wrap="wrap">
                <Box>
                  <Text fontSize="xs" color="text-tertiary" mb="1">边状态</Text>
                  <StatusBadge status={edge.status} />
                </Box>
                <Box>
                  <Text fontSize="xs" color="text-tertiary" mb="1">规划状态</Text>
                  <StatusBadge status={edge.promptStatus} />
                </Box>
                <Box>
                  <Text fontSize="xs" color="text-tertiary" mb="1">视频状态</Text>
                  <StatusBadge status={edge.videoStatus} />
                </Box>
              </Flex>
            </Box>
          )}

          {/* AI Transition Description (when auto mode) */}
          {!isManualMode && (
            <>
              <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
                AI 转场描述
              </Text>
              {hasTransitionDescription ? (
                <Box mb="4">
                  {strategyModeLabel && (
                    <Box mb="3">
                      <Text fontSize="xs" color="text-tertiary" mb="1.5">转场策略</Text>
                      <Badge bg="rgba(59,130,246,0.12)" color="#3b82f6" fontSize="xs" px="2" py="0.5" rounded="sm">
                        {strategyModeLabel}
                      </Badge>
                    </Box>
                  )}
                  {edge.transitionStrategyReason && (
                    <Field label="策略理由" value={edge.transitionStrategyReason} disabled multiline rows={3} />
                  )}
                  {transitionPlan?.entryFocus && (
                    <Field label="进入焦点" value={transitionPlan.entryFocus} disabled multiline rows={2} />
                  )}
                  {transitionPlan?.openingPhase && (
                    <Field label="前段进入" value={transitionPlan.openingPhase} disabled multiline rows={3} />
                  )}
                  {transitionPlan?.handoffPhase && (
                    <Field label="中段接管" value={transitionPlan.handoffPhase} disabled multiline rows={3} />
                  )}
                  {transitionPlan?.landingPhase && (
                    <Field label="后段落版" value={transitionPlan.landingPhase} disabled multiline rows={3} />
                  )}
                  {transitionPlan?.avoidances?.length > 0 && (
                    <Box mb="4">
                      <Text fontSize="xs" fontWeight="500" color="text-tertiary" mb="1.5">
                        避免事项
                      </Text>
                      <VStack align="stretch" gap="1.5">
                        {transitionPlan.avoidances.map((item: string, index: number) => (
                          <Box
                            key={`${item}-${index}`}
                            px="3"
                            py="2"
                            rounded="md"
                            fontSize="xs"
                            color="text-secondary"
                            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}` }}
                          >
                            {item}
                          </Box>
                        ))}
                      </VStack>
                    </Box>
                  )}
                  {edge.transitionPrompt && (
                    <Field label="最终视频提示词（只读）" value={edge.transitionPrompt} disabled multiline rows={8} mono />
                  )}
                </Box>
              ) : (
                <Flex
                  align="center"
                  gap="2"
                  mb="4"
                  p="3"
                  rounded="md"
                  bg="rgba(92,95,119,0.08)"
                  style={{ border: `1px dashed ${BORDER}` }}
                >
                  <Text fontSize="xs" color="text-tertiary">暂无 AI 转场描述，请先生成转场。</Text>
                </Flex>
              )}
            </>
          )}

          <SaveButton
            saving={saving}
            onClick={() => {
              const builtinConfig = getBuiltinConfig()
              onSave({
                relationLabel,
                transitionDescriptionMode,
                manualTransitionPrompt: isManualMode ? manualTransitionPrompt : manualTransitionPrompt,
                transitionType: selectedTransition?.type === 'video' ? 'video' :
                               selectedTransition?.type === 'builtin' ? 'builtin' : undefined,
                builtinTransition: builtinConfig ? {
                  type: builtinConfig.type,
                  direction: (builtinConfig as any).direction,
                  duration: builtinConfig.duration,
                  easing: builtinConfig.easing,
                  ...(builtinConfig.type === 'flip' ? { flipStyle: (builtinConfig as FlipConfig).flipStyle } : {}),
                  ...(builtinConfig.type === 'zoom' ? {
                    scale: (builtinConfig as ZoomConfig).scale,
                    centerX: (builtinConfig as ZoomConfig).centerX,
                    centerY: (builtinConfig as ZoomConfig).centerY,
                    focusMode: (builtinConfig as ZoomConfig).focusMode,
                    focusQuad: (builtinConfig as ZoomConfig).focusQuad,
                  } : {}),
                } : undefined,
              })
            }}
          />

          {onRegenerateEdge && (
            <Button
              w="100%"
              mt="3"
              bg="rgba(59,130,246,0.12)"
              color="#3b82f6"
              _hover={{ bg: 'rgba(59,130,246,0.2)' }}
              loading={false}
              onClick={async () => {
                try {
                  await onRegenerateEdge(edge.id)
                } catch {
                  // Error handled by parent
                }
              }}
              size="sm"
            >
              <RefreshCw size={14} style={{ marginRight: 6 }} />
              重新生成转场
            </Button>
          )}
        </Box>
      </Box>
    </Flex>
  )
}
