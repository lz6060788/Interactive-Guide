import { useState, useEffect } from 'react'
import {
  Box, Flex, Text, Button, Heading, Badge,
  IconButton, VStack, HStack,
} from '@chakra-ui/react'
import { X, Crosshair, Save, Image as ImageIcon, Trash2, RefreshCw, Upload } from 'lucide-react'
import { uploadNodeImage, uploadEdgeVideo } from '../services/api'

interface Props {
  pkg: any
  selected: { type: 'package' } | { type: 'node'; id: string } | { type: 'edge'; id: string }
  onClose: () => void
  onSave: (data: any) => void
  saving: boolean
  onOpenHotspotEditor: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  onRegenerateNode?: (nodeId: string) => void
  onRegenerateHotspots?: (nodeId: string) => Promise<void>
  onRegenerateEdge?: (edgeId: string) => Promise<void>
}

const BORDER = '#2a2d3a'

export function DetailDrawer({
  pkg,
  selected,
  onClose,
  onSave,
  saving,
  onOpenHotspotEditor,
  onDeleteNode,
  onRegenerateNode,
  onRegenerateHotspots,
  onRegenerateEdge,
}: Props) {
  return (
    <Flex position="fixed" top="0" right="0" bottom="0" zIndex={100}>
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.500" onClick={onClose} />

      {/* Drawer panel */}
      <Box
        position="relative"
        w="520px"
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
            {selected.type === 'package' ? '知识包配置' :
             selected.type === 'node' ? `节点: ${pkg.nodes.find((n: any) => n.id === selected.id)?.title ?? selected.id}` :
             `边: ${pkg.edges.find((e: any) => e.id === selected.id)?.relationLabel ?? selected.id}`}
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
          {selected.type === 'package' && (
            <PackageForm pkg={pkg} onSave={onSave} saving={saving} />
          )}
          {selected.type === 'node' && (
            <NodeForm
              guideId={pkg.id}
              node={pkg.nodes.find((n: any) => n.id === selected.id)}
              onSave={onSave}
              saving={saving}
              onOpenHotspotEditor={onOpenHotspotEditor}
              onDeleteNode={onDeleteNode}
              onRegenerateNode={onRegenerateNode}
              onRegenerateHotspots={onRegenerateHotspots}
            />
          )}
          {selected.type === 'edge' && (
            <EdgeForm
              guideId={pkg.id}
              edge={pkg.edges.find((e: any) => e.id === selected.id)}
              onSave={onSave}
              saving={saving}
              onRegenerateEdge={onRegenerateEdge}
            />
          )}
        </Box>
      </Box>
    </Flex>
  )
}

// ─── Field Component ───────────────────────────────────

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
      <Text
        fontSize="xs"
        fontWeight="500"
        color="text-tertiary"
        mb="1.5"
      >
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

function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

// ─── Select Field Component ────────────────────────

const STYLE_OPTIONS = [
  { value: 'morandi-journal', label: 'Morandi Journal — 暖色手绘日记' },
  { value: 'pop-laboratory', label: 'Pop Laboratory — 实验室精度' },
  { value: 'cyberpunk-neon', label: 'Cyberpunk Neon — 赛博霓虹' },
  { value: 'technical-schematic', label: 'Technical Schematic — 工程蓝图' },
  { value: 'craft-handmade', label: 'Craft Handmade — 手工拼贴' },
]

const TOPIC_TYPE_OPTIONS = [
  { value: 'general', label: 'General — 通用内容' },
  { value: 'news-report', label: 'News Report — 新闻播报' },
  { value: 'common-knowledge', label: 'Common Knowledge — 常识介绍' },
  { value: 'content-analysis', label: 'Content Analysis — 内容解读' },
]

function SelectField({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Box mb="4">
      <Text fontSize="xs" fontWeight="500" color="text-tertiary" mb="1.5">
        {label}
      </Text>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          background: '#0a0b0f',
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          color: '#e4e4e7',
          fontSize: '13px',
          padding: '8px 12px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </Box>
  )
}

// ─── Status Badge ───────────────────────────────────

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

// ─── Save Button ───────────────────────────────────

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

// ─── Package Form ───────────────────────────────────

function PackageForm({ pkg, onSave, saving }: { pkg: any; onSave: (d: any) => void; saving: boolean }) {
  const [title, setTitle] = useState(pkg.title)
  const [version, setVersion] = useState(pkg.version)
  const [description, setDescription] = useState(pkg.description || '')
  const [visualStyle, setVisualStyle] = useState(pkg.visualStyle || '')
  const [transitionStyle, setTransitionStyle] = useState(pkg.transitionStyle || '')
  const [style, setStyle] = useState(pkg.style || 'morandi-journal')

  return (
    <div>
      <Field label="标题" value={title} onChange={setTitle} />
      <Field label="版本" value={version} onChange={setVersion} />
      <Field label="描述" value={description} onChange={setDescription} multiline />
      <SelectField label="信息图风格" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
      <Field label="画面风格 (补充)" value={visualStyle} onChange={setVisualStyle} multiline />
      <Field label="转场风格" value={transitionStyle} onChange={setTransitionStyle} multiline />
      <SaveButton saving={saving} onClick={() => onSave({ title, version, description, style, visualStyle, transitionStyle })} />
    </div>
  )
}

// ─── Node Form ───────────────────────────────────

function NodeForm({ guideId, node, onSave, saving, onOpenHotspotEditor, onDeleteNode, onRegenerateNode, onRegenerateHotspots }: {
  guideId: string; node: any; onSave: (d: any) => void; saving: boolean; onOpenHotspotEditor: (id: string) => void
  onDeleteNode?: (id: string) => void
  onRegenerateNode?: (id: string) => void
  onRegenerateHotspots?: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(node.title)
  const [topicType, setTopicType] = useState(node.topicType || 'general')
  const [visualIntent, setVisualIntent] = useState(node.visualIntent || node.presentationIntent || '')
  const [summary, setSummary] = useState(node.summary || '')
  const [sourceText, setSourceText] = useState(node.sourceText || '')
  const [keyContentValue, setKeyContentValue] = useState(node.keyContent || '')
  const [keyPointsText, setKeyPointsText] = useState((node.keyPoints || []).join('\n'))
  const [hotspotHintsText, setHotspotHintsText] = useState((node.hotspotHints || []).join('\n'))
  const [hotspotLoading, setHotspotLoading] = useState(false)
  const [hotspotMsg, setHotspotMsg] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState(node.imageUrl)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadImageMsg, setUploadImageMsg] = useState<string | null>(null)

  useEffect(() => { setImageUrl(node.imageUrl) }, [node.imageUrl])

  return (
    <div>
      {/* 基本信息 */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
        基本信息
      </Text>
      <Field label="ID" value={node.id} disabled />
      <Field label="标题" value={title} onChange={setTitle} />
      <SelectField label="主题类型" value={topicType} onChange={setTopicType} options={TOPIC_TYPE_OPTIONS} />
      <Field label="页面摘要" value={summary} onChange={setSummary} multiline rows={3} />
      <Field label="视觉意图" value={visualIntent} onChange={setVisualIntent} multiline rows={3} />

      {/* 状态信息（只读） */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
        状态
      </Text>
      <Flex gap="4" mb="4">
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">节点状态</Text>
          <StatusBadge status={node.status} />
        </Box>
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">图片状态</Text>
          <StatusBadge status={node.imageStatus} />
        </Box>
      </Flex>

      {/* 图片预览 */}
      {imageUrl && (
        <Box mb="4">
          <Text fontSize="xs" color="text-tertiary" mb="1.5">图片预览</Text>
          <Box
            rounded="md"
            overflow="hidden"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <img
              src={imageUrl}
              alt={node.title}
              style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain', display: 'block' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </Box>
          <input
            type="file"
            accept="image/*"
            id={`node-upload-${node.id}`}
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadingImage(true)
              setUploadImageMsg(null)
              try {
                const result = await uploadNodeImage(guideId, node.id, file)
                setImageUrl(result.imageUrl)
                setUploadImageMsg('图片上传成功')
                setTimeout(() => setUploadImageMsg(null), 3000)
              } catch (err: any) {
                setUploadImageMsg(err.message || '上传失败')
              } finally {
                setUploadingImage(false)
                e.target.value = ''
              }
            }}
          />
          <Button
            w="100%"
            mt="2"
            size="sm"
            variant="ghost"
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            loading={uploadingImage}
            onClick={() => document.getElementById(`node-upload-${node.id}`)?.click()}
          >
            <Upload size={14} style={{ marginRight: 6 }} />
            上传图片替换
          </Button>
          {uploadImageMsg && (
            <Text fontSize="xs" color={uploadImageMsg.includes('成功') ? '#22c55e' : '#ef4444'} mt="1" px="1">
              {uploadImageMsg}
            </Text>
          )}
        </Box>
      )}
      {!imageUrl && (
        <Flex
          align="center"
          gap="2"
          mb="4"
          p="3"
          rounded="md"
          bg="rgba(92,95,119,0.08)"
          style={{ border: `1px dashed ${BORDER}` }}
        >
          <ImageIcon size={14} color="#5c5f77" />
          <Text fontSize="xs" color="text-tertiary">暂无图片</Text>
        </Flex>
      )}

      {/* 内容块 */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
        内容
      </Text>
      <Field label="核心要点（每行一条）" value={keyPointsText} onChange={setKeyPointsText} multiline rows={5} />
      <Field label="原始内容参考" value={sourceText} onChange={setSourceText} multiline rows={6} />
      <Field label="内容描述" value={keyContentValue} onChange={setKeyContentValue} multiline rows={6} />
      <Field label="热点提示（每行一条）" value={hotspotHintsText} onChange={setHotspotHintsText} multiline rows={4} />

      {/* 热点 */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
        热点
      </Text>
      <Flex justify="space-between" align="center" mb="3">
        <Text fontSize="xs" color="text-secondary">
          共 {node.hotspots?.length ?? 0} 个热点
        </Text>
        <Flex gap="2">
          {onRegenerateHotspots && (
            <Button
              size="xs"
              variant="ghost"
              color="#3b82f6"
              _hover={{ bg: 'rgba(59,130,246,0.12)' }}
              loading={hotspotLoading}
              onClick={async () => {
                setHotspotLoading(true)
                setHotspotMsg(null)
                try {
                  await onRegenerateHotspots(node.id)
                  setHotspotMsg('热点已更新')
                  setTimeout(() => setHotspotMsg(null), 3000)
                } catch (e: any) {
                  setHotspotMsg(e.message)
                } finally {
                  setHotspotLoading(false)
                }
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 4 }} />
              AI定位
            </Button>
          )}
          <Button
          size="xs"
          variant="ghost"
          color="brand"
          _hover={{ bg: 'brand-subtle' }}
          onClick={() => onOpenHotspotEditor(node.id)}
        >
          <Crosshair size={12} style={{ marginRight: 4 }} />
          校准
        </Button>
        </Flex>
      </Flex>
      {hotspotMsg && (
        <Text
          fontSize="xs"
          color={hotspotMsg.includes('已更新') ? '#22c55e' : '#ef4444'}
          mb="2"
          px="1"
        >
          {hotspotMsg}
        </Text>
      )}
      {node.hotspots?.map((hs: any, i: number) => (
        <Flex
          key={i}
          justify="space-between"
          align="center"
          px="3"
          py="2"
          rounded="md"
          mb="1"
          style={{ background: '#0a0b0f', border: `1px solid ${BORDER}` }}
        >
          <HStack gap="2">
            <Flex
              w="18px" h="18px" rounded="full"
              bg="brand" color="white"
              align="center" justify="center"
              fontSize="2xs" fontWeight="700"
              flexShrink={0}
            >
              {i + 1}
            </Flex>
            <Text fontSize="xs" fontWeight="500" color="text-primary">{hs.label}</Text>
          </HStack>
          <Text fontSize="2xs" color="text-tertiary">
            ({hs.normalizedX?.toFixed(2)}, {hs.normalizedY?.toFixed(2)}) → {hs.targetNodeId}
          </Text>
        </Flex>
      ))}
      {(!node.hotspots || node.hotspots.length === 0) && (
        <Text fontSize="xs" color="text-tertiary" textAlign="center" py="3">
          暂无热点
        </Text>
      )}

      <SaveButton
        saving={saving}
        onClick={() => onSave({
          title,
          topicType,
          summary,
          visualIntent,
          presentationIntent: visualIntent,
          sourceText,
          keyContent: keyContentValue,
          keyPoints: linesToArray(keyPointsText),
          hotspotHints: linesToArray(hotspotHintsText),
        })}
      />

      {onRegenerateNode && (
        <Button
          w="100%"
          mt="3"
          bg="rgba(59,130,246,0.12)"
          color="#3b82f6"
          _hover={{ bg: 'rgba(59,130,246,0.2)' }}
          onClick={() => onRegenerateNode(node.id)}
          size="sm"
        >
          <RefreshCw size={14} style={{ marginRight: 6 }} />
          重新生成图片
        </Button>
      )}

      {onDeleteNode && node.id !== 'root' && (
        <Button
          w="100%"
          mt="3"
          bg="rgba(239,68,68,0.12)"
          color="#ef4444"
          _hover={{ bg: 'rgba(239,68,68,0.2)' }}
          onClick={() => {
            if (confirm(`确认删除节点 "${node.title}"？此操作不可撤销。`)) {
              onDeleteNode(node.id)
            }
          }}
          size="sm"
        >
          <Trash2 size={14} style={{ marginRight: 6 }} />
          删除节点
        </Button>
      )}
    </div>
  )
}

// ─── Edge Form ───────────────────────────────────

function EdgeForm({
  guideId,
  edge,
  onSave,
  saving,
  onRegenerateEdge,
}: {
  guideId: string
  edge: any
  onSave: (d: any) => void
  saving: boolean
  onRegenerateEdge?: (id: string) => Promise<void>
}) {
  const [relationLabel, setRelationLabel] = useState(edge.relationLabel || '')
  const [transitionDescriptionMode, setTransitionDescriptionMode] = useState(edge.transitionDescriptionMode || 'auto')
  const [manualTransitionPrompt, setManualTransitionPrompt] = useState(edge.manualTransitionPrompt || '')
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoMsg, setVideoMsg] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState(edge.videoUrl)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadVideoMsg, setUploadVideoMsg] = useState<string | null>(null)
  const transitionPlan = edge.transitionPlan

  useEffect(() => { setVideoUrl(edge.videoUrl) }, [edge.videoUrl])
  const strategyModeLabel =
    edge.transitionStrategyMode === 'element-bridge' ? '元素桥接' :
    edge.transitionStrategyMode === 'fallback-navigation' ? '兜底导览' :
    edge.transitionStrategyMode === 'manual-directed' ? '人工导演' :
    ''
  const isManualMode = transitionDescriptionMode === 'manual'
  const hasTransitionDescription = Boolean(
    edge.transitionStrategyReason ||
    transitionPlan ||
    edge.transitionPrompt,
  )

  return (
    <div>
      <Field label="ID" value={edge.id} disabled />
      <Field label="起始节点" value={edge.fromNodeId} disabled />
      <Field label="目标节点" value={edge.toNodeId} disabled />
      <Field label="关系文案" value={relationLabel} onChange={setRelationLabel} />

      <Box mb="4">
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

      {videoUrl && (
        <Box mb="4">
          <Text fontSize="xs" color="text-tertiary" mb="1.5">转场预览</Text>
          <Box rounded="md" overflow="hidden" style={{ border: `1px solid ${BORDER}` }}>
            <video
              src={videoUrl}
              controls
              muted
              playsInline
              style={{ width: '100%', display: 'block', background: '#05060a' }}
            />
          </Box>
          <input
            type="file"
            accept="video/*"
            id={`edge-upload-${edge.id}`}
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadingVideo(true)
              setUploadVideoMsg(null)
              try {
                const result = await uploadEdgeVideo(guideId, edge.id, file)
                setVideoUrl(result.videoUrl)
                setUploadVideoMsg('视频上传成功')
                setTimeout(() => setUploadVideoMsg(null), 3000)
              } catch (err: any) {
                setUploadVideoMsg(err.message || '上传失败')
              } finally {
                setUploadingVideo(false)
                e.target.value = ''
              }
            }}
          />
          <Button
            w="100%"
            mt="2"
            size="sm"
            variant="ghost"
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            loading={uploadingVideo}
            onClick={() => document.getElementById(`edge-upload-${edge.id}`)?.click()}
          >
            <Upload size={14} style={{ marginRight: 6 }} />
            上传视频替换
          </Button>
          {uploadVideoMsg && (
            <Text fontSize="xs" color={uploadVideoMsg.includes('成功') ? '#22c55e' : '#ef4444'} mt="1" px="1">
              {uploadVideoMsg}
            </Text>
          )}
        </Box>
      )}

      {videoMsg && (
        <Text
          fontSize="xs"
          color={videoMsg.includes('已触发') ? '#22c55e' : '#ef4444'}
          mb="2"
          px="1"
        >
          {videoMsg}
        </Text>
      )}

      <SaveButton
        saving={saving}
        onClick={() => onSave({
          relationLabel,
          transitionDescriptionMode,
          manualTransitionPrompt: isManualMode ? manualTransitionPrompt : manualTransitionPrompt,
        })}
      />

      {onRegenerateEdge && (
        <Button
          w="100%"
          mt="3"
          bg="rgba(59,130,246,0.12)"
          color="#3b82f6"
          _hover={{ bg: 'rgba(59,130,246,0.2)' }}
          loading={videoLoading}
          onClick={async () => {
            setVideoLoading(true)
            setVideoMsg(null)
            try {
              await onRegenerateEdge(edge.id)
              setVideoMsg('转场已触发重生成')
              setTimeout(() => setVideoMsg(null), 3000)
            } catch (e: any) {
              setVideoMsg(e.message)
            } finally {
              setVideoLoading(false)
            }
          }}
          size="sm"
        >
          <RefreshCw size={14} style={{ marginRight: 6 }} />
          重新生成转场
        </Button>
      )}
    </div>
  )
}
