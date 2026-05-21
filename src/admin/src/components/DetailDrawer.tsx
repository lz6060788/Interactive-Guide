import { useState } from 'react'
import {
  Box, Flex, Text, Button, Heading, IconButton,
} from '@chakra-ui/react'
import { X, Save } from 'lucide-react'
import { NodeModal } from './NodeModal.js'
import { EdgeModal } from './EdgeModal.js'

const BORDER = '#2a2d3a'

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
  // Delegate to specialized modals for node and edge
  if (selected.type === 'node') {
    return (
      <NodeModal
        pkg={pkg}
        nodeId={selected.id}
        onClose={onClose}
        onSave={onSave}
        saving={saving}
        onOpenHotspotEditor={onOpenHotspotEditor}
        onDeleteNode={onDeleteNode}
        onRegenerateNode={onRegenerateNode}
        onRegenerateHotspots={onRegenerateHotspots}
      />
    )
  }

  if (selected.type === 'edge') {
    return (
      <EdgeModal
        pkg={pkg}
        edgeId={selected.id}
        onClose={onClose}
        onSave={onSave}
        saving={saving}
        onRegenerateEdge={onRegenerateEdge}
      />
    )
  }

  // Package form remains inline (simple enough)
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
            知识包配置
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
          <PackageForm pkg={pkg} onSave={onSave} saving={saving} />
        </Box>
      </Box>
    </Flex>
  )
}

// ─── Package Form ───────────────────────────────────

const STYLE_OPTIONS = [
  { value: 'morandi-journal', label: 'Morandi Journal — 暖色手绘日记' },
  { value: 'pop-laboratory', label: 'Pop Laboratory — 实验室精度' },
  { value: 'cyberpunk-neon', label: 'Cyberpunk Neon — 赛博霓虹' },
  { value: 'technical-schematic', label: 'Technical Schematic — 工程蓝图' },
  { value: 'craft-handmade', label: 'Craft Handmade — 手工拼贴' },
]

const RESOLUTION_OPTIONS = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '375*808', label: '375*808 iPhone 竖屏' },
]

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

function PackageForm({ pkg, onSave, saving }: { pkg: any; onSave: (d: any) => void; saving: boolean }) {
  const [title, setTitle] = useState(pkg.title)
  const [version, setVersion] = useState(pkg.version)
  const [description, setDescription] = useState(pkg.description || '')
  const [resolution, setResolution] = useState(pkg.resolution || '16:9')
  const [visualStyle, setVisualStyle] = useState(pkg.visualStyle || '')
  const [transitionStyle, setTransitionStyle] = useState(pkg.transitionStyle || '')
  const [style, setStyle] = useState(pkg.style || 'morandi-journal')

  return (
    <div>
      <Field label="标题" value={title} onChange={setTitle} />
      <Field label="版本" value={version} onChange={setVersion} />
      <Field label="描述" value={description} onChange={setDescription} multiline />
      <SelectField label="画面比例" value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} />
      <SelectField label="信息图风格" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
      <Field label="画面风格 (补充)" value={visualStyle} onChange={setVisualStyle} multiline />
      <Field label="转场风格" value={transitionStyle} onChange={setTransitionStyle} multiline />
      <SaveButton saving={saving} onClick={() => onSave({ title, version, description, resolution, style, visualStyle, transitionStyle })} />
    </div>
  )
}
