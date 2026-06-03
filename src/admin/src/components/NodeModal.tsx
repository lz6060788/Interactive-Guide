import { useState, useEffect } from 'react'
import {
  Box, Flex, Text, Button, Heading, Badge,
  IconButton, VStack, HStack,
} from '@chakra-ui/react'
import { X, Crosshair, Save, Image as ImageIcon, Trash2, RefreshCw, Upload } from 'lucide-react'
import { uploadNodeImage, uploadNodeHtml } from '../services/api'

const BORDER = '#2a2d3a'

interface NodeModalProps {
  pkg: any
  nodeId: string
  onClose: () => void
  onSave: (data: any) => void
  saving: boolean
  onOpenHotspotEditor: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  onRegenerateNode?: (nodeId: string) => void
  onRegenerateHotspots?: (nodeId: string) => Promise<void>
}

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

const IMAGE_FIT_OPTIONS = [
  { value: 'fill', label: 'Fill — 拉伸填满（默认）' },
  { value: 'fitHeight', label: 'Fit Height — 等比按高度（可横拖）' },
  { value: 'fitWidth', label: 'Fit Width — 等比按宽度（可纵拖）' },
]

const NODE_KIND_OPTIONS = [
  { value: 'image', label: 'Image — 普通图片节点' },
  { value: 'region', label: 'Region — 局部子图节点' },
  { value: 'html', label: 'HTML — 独立 HTML 页面' },
]

function formatJson(value: unknown): string {
  return value ? JSON.stringify(value, null, 2) : ''
}

function Field({ label, value, onChange, disabled, multiline, rows, mono, placeholder }: {
  label: string
  value: string
  onChange?: (v: string) => void
  disabled?: boolean
  multiline?: boolean
  rows?: number
  mono?: boolean
  placeholder?: string
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
          placeholder={placeholder}
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
          placeholder={placeholder}
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

function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

export function NodeModal({
  pkg,
  nodeId,
  onClose,
  onSave,
  saving,
  onOpenHotspotEditor,
  onDeleteNode,
  onRegenerateNode,
  onRegenerateHotspots,
}: NodeModalProps) {
  const node = pkg.nodes.find((n: any) => n.id === nodeId)
  if (!node) return null

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
  const [imageFitMode, setImageFitMode] = useState(node.imageFitMode || 'fill')
  const [nodeKind, setNodeKind] = useState(node.nodeKind || (node.contentType === 'html' ? 'html' : 'image'))
  const [htmlSource, setHtmlSource] = useState(node.htmlSource || '')
  const [hotspotEdgeIdsText, setHotspotEdgeIdsText] = useState((node.hotspotEdgeIds || []).join('\n'))
  const [uploadingHtml, setUploadingHtml] = useState(false)
  const [uploadHtmlMsg, setUploadHtmlMsg] = useState<string | null>(null)
  const [regionViewportText, setRegionViewportText] = useState(formatJson(node.regionViewport))
  const [regionOverlayText, setRegionOverlayText] = useState(formatJson(node.regionOverlay))

  useEffect(() => { setImageUrl(node.imageUrl) }, [node.imageUrl])

  return (
    <Flex position="fixed" top="0" right="0" bottom="0" zIndex={100}>
      {/* Backdrop */}
      <Box position="fixed" inset="0" bg="blackAlpha.500" onClick={onClose} />

      {/* Modal panel */}
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
            节点: {node.title ?? nodeId}
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
          {/* 基本信息 */}
          <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
            基本信息
          </Text>
          <Field label="ID" value={node.id} disabled />
          <Field label="标题" value={title} onChange={setTitle} />
          <SelectField label="主题类型" value={topicType} onChange={setTopicType} options={TOPIC_TYPE_OPTIONS} />
          <SelectField
            label="节点类型"
            value={nodeKind}
            onChange={(v) => setNodeKind(v)}
            options={NODE_KIND_OPTIONS}
          />
          <Field label="页面摘要" value={summary} onChange={setSummary} multiline rows={3} />
          {nodeKind === 'image' && (
            <>
              <Field label="视觉意图" value={visualIntent} onChange={setVisualIntent} multiline rows={3} />
              <SelectField label="图片填充模式" value={imageFitMode} onChange={setImageFitMode} options={IMAGE_FIT_OPTIONS} />
            </>
          )}
          {nodeKind === 'region' && (
            <>
              <Field
                label="Region 视窗配置 JSON"
                value={regionViewportText}
                onChange={setRegionViewportText}
                multiline
                rows={10}
                mono
                placeholder='{"sourceNodeId":"root","coordSpace":"source-normalized","panRange":{...},"initialWindowRule":{"mode":"derive-from-pan-range-center","fitBy":"height"}}'
              />
              <Field
                label="Region 卡片配置 JSON"
                value={regionOverlayText}
                onChange={setRegionOverlayText}
                multiline
                rows={12}
                mono
                placeholder='{"template":"stock-info-v1","showWhenActive":true,"cards":[...]}'
              />
            </>
          )}

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

          {/* 图片预览 / 上传（所有节点类型均可上传） */}
          <Box mb="4">
            <Text fontSize="xs" color="text-tertiary" mb="1.5">图片</Text>
            {imageUrl && (
              <Box
                rounded="md"
                overflow="hidden"
                mb="2"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <img
                  src={imageUrl}
                  alt={node.title}
                  style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain', display: 'block' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </Box>
            )}
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
                  const result = await uploadNodeImage(pkg.id, node.id, file)
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
              size="sm"
              variant="ghost"
              color="text-secondary"
              _hover={{ bg: 'surface-raised' }}
              loading={uploadingImage}
              onClick={() => document.getElementById(`node-upload-${node.id}`)?.click()}
            >
              <Upload size={14} style={{ marginRight: 6 }} />
              {imageUrl ? '上传图片替换' : '上传图片'}
            </Button>
            {uploadImageMsg && (
              <Text fontSize="xs" color={uploadImageMsg.includes('成功') ? '#22c55e' : '#ef4444'} mt="1" px="1">
                {uploadImageMsg}
              </Text>
            )}
          </Box>

          {/* HTML 配置 / 上传 */}
          {nodeKind === 'html' && (
            <Box mb="4">
              <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
                HTML 配置
              </Text>
              <Field
                label="HTML 源文件路径"
                value={htmlSource}
                onChange={setHtmlSource}
                placeholder="assets/nodes/my-page.html"
              />
              <Field
                label="热点边 ID（每行一个）"
                value={hotspotEdgeIdsText}
                onChange={setHotspotEdgeIdsText}
                multiline
                rows={3}
              />
              <Text fontSize="xs" color="text-tertiary" mb="1.5">HTML 文件</Text>
              <input
                type="file"
                accept=".html"
                id={`node-html-upload-${node.id}`}
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploadingHtml(true)
                  setUploadHtmlMsg(null)
                  try {
                    await uploadNodeHtml(pkg.id, node.id, file)
                    setUploadHtmlMsg('HTML 上传成功')
                    setTimeout(() => setUploadHtmlMsg(null), 3000)
                  } catch (err: any) {
                    setUploadHtmlMsg(err.message || '上传失败')
                  } finally {
                    setUploadingHtml(false)
                    e.target.value = ''
                  }
                }}
              />
              <Button
                w="100%"
                size="sm"
                variant="ghost"
                color="text-secondary"
                _hover={{ bg: 'surface-raised' }}
                loading={uploadingHtml}
                onClick={() => document.getElementById(`node-html-upload-${node.id}`)?.click()}
              >
                <Upload size={14} style={{ marginRight: 6 }} />
                上传 HTML 文件
              </Button>
              {uploadHtmlMsg && (
                <Text fontSize="xs" color={uploadHtmlMsg.includes('成功') ? '#22c55e' : '#ef4444'} mt="1" px="1">
                  {uploadHtmlMsg}
                </Text>
              )}
            </Box>
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
            onClick={() => {
              let parsedRegionViewport: any
              let parsedRegionOverlay: any
              try {
                parsedRegionViewport = nodeKind === 'region' && regionViewportText.trim()
                  ? JSON.parse(regionViewportText)
                  : undefined
                parsedRegionOverlay = nodeKind === 'region' && regionOverlayText.trim()
                  ? JSON.parse(regionOverlayText)
                  : undefined
              } catch (error: any) {
                window.alert(`Region JSON 配置无效: ${error.message}`)
                return
              }

              onSave({
                title,
                topicType,
                summary,
                visualIntent,
                presentationIntent: visualIntent,
                sourceText,
                keyContent: keyContentValue,
                keyPoints: linesToArray(keyPointsText),
                hotspotHints: linesToArray(hotspotHintsText),
                imageFitMode,
                nodeKind,
                contentType: nodeKind === 'html' ? 'html' : 'image',
                htmlSource: nodeKind === 'html' ? htmlSource : undefined,
                hotspotEdgeIds: nodeKind === 'html' ? linesToArray(hotspotEdgeIdsText) : undefined,
                regionViewport: nodeKind === 'region' ? parsedRegionViewport : undefined,
                regionOverlay: nodeKind === 'region' ? parsedRegionOverlay : undefined,
              })
            }}
          />

          {onRegenerateNode && nodeKind === 'image' && (
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
        </Box>
      </Box>
    </Flex>
  )
}
