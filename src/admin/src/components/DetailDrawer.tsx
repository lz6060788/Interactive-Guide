import { useState } from 'react'
import {
  Box, Flex, Text, Button, Heading, Badge,
  IconButton, VStack, HStack,
} from '@chakra-ui/react'
import { X, Crosshair, Save, Image as ImageIcon, Trash2 } from 'lucide-react'

interface Props {
  pkg: any
  selected: { type: 'package' } | { type: 'node'; id: string } | { type: 'edge'; id: string }
  onClose: () => void
  onSave: (data: any) => void
  saving: boolean
  onOpenHotspotEditor: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
}

const BORDER = '#2a2d3a'

export function DetailDrawer({ pkg, selected, onClose, onSave, saving, onOpenHotspotEditor, onDeleteNode }: Props) {
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
              node={pkg.nodes.find((n: any) => n.id === selected.id)}
              onSave={onSave}
              saving={saving}
              onOpenHotspotEditor={onOpenHotspotEditor}
              onDeleteNode={onDeleteNode}
            />
          )}
          {selected.type === 'edge' && (
            <EdgeForm
              edge={pkg.edges.find((e: any) => e.id === selected.id)}
              onSave={onSave}
              saving={saving}
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

// ─── Status Badge ───────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const colorMap: Record<string, { bg: string; color: string; label: string }> = {
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

  return (
    <div>
      <Field label="标题" value={title} onChange={setTitle} />
      <Field label="版本" value={version} onChange={setVersion} />
      <Field label="描述" value={description} onChange={setDescription} multiline />
      <Field label="画面风格" value={visualStyle} onChange={setVisualStyle} multiline />
      <Field label="转场风格" value={transitionStyle} onChange={setTransitionStyle} multiline />
      <SaveButton saving={saving} onClick={() => onSave({ title, version, description, visualStyle, transitionStyle })} />
    </div>
  )
}

// ─── Node Form ───────────────────────────────────

function NodeForm({ node, onSave, saving, onOpenHotspotEditor, onDeleteNode }: {
  node: any; onSave: (d: any) => void; saving: boolean; onOpenHotspotEditor: (id: string) => void
  onDeleteNode?: (id: string) => void
}) {
  const [title, setTitle] = useState(node.title)
  const [presentationIntent, setPresentationIntent] = useState(node.presentationIntent || '')
  const [keyContentValue, setKeyContentValue] = useState(node.keyContent || '')

  return (
    <div>
      {/* 基本信息 */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3">
        基本信息
      </Text>
      <Field label="ID" value={node.id} disabled />
      <Field label="标题" value={title} onChange={setTitle} />
      <Field label="呈现意图" value={presentationIntent} onChange={setPresentationIntent} multiline />

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
      {node.imageUrl && (
        <Box mb="4">
          <Text fontSize="xs" color="text-tertiary" mb="1.5">图片预览</Text>
          <Box
            rounded="md"
            overflow="hidden"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <img
              src={node.imageUrl}
              alt={node.title}
              style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain', display: 'block' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </Box>
        </Box>
      )}
      {!node.imageUrl && (
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
      <Field label="内容描述" value={keyContentValue} onChange={setKeyContentValue} multiline rows={6} />

      {/* 热点 */}
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="3" mt="2">
        热点
      </Text>
      <Flex justify="space-between" align="center" mb="3">
        <Text fontSize="xs" color="text-secondary">
          共 {node.hotspots?.length ?? 0} 个热点
        </Text>
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

      <SaveButton saving={saving} onClick={() => onSave({ title, presentationIntent, keyContent: keyContentValue })} />

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

function EdgeForm({ edge, onSave, saving }: { edge: any; onSave: (d: any) => void; saving: boolean }) {
  const [relationLabel, setRelationLabel] = useState(edge.relationLabel || '')

  return (
    <div>
      <Field label="ID" value={edge.id} disabled />
      <Field label="起始节点" value={edge.fromNodeId} disabled />
      <Field label="目标节点" value={edge.toNodeId} disabled />
      <Field label="关系文案" value={relationLabel} onChange={setRelationLabel} />

      {edge.videoStatus && (
        <Box mb="4">
          <Text fontSize="xs" color="text-tertiary" mb="1.5">视频状态</Text>
          <StatusBadge status={edge.videoStatus} />
        </Box>
      )}

      <SaveButton saving={saving} onClick={() => onSave({ relationLabel })} />
    </div>
  )
}
