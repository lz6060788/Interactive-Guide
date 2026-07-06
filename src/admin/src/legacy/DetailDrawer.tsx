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

const DEFAULT_INFO_OVERLAY = {
  title: '说明',
  sections: [
    {
      heading: '资料来源',
      body: '本产业链图谱基于民生证券、华泰证券、国信证券等公开研报，以及行业公开资料、网络公开信息整理。节点分类、层级关系、说明文案及部分可视化形式由 AI 辅助归纳、生成和编辑，可能存在遗漏、简化或不准确之处。',
    },
    {
      heading: '免责声明',
      body: '相关内容仅用于产业链结构理解和产品功能展示，不构成投资建议、采购建议、技术选型建议或商业决策依据。如需用于正式研究或决策，请以权威机构、企业公告、原始研报及人工核验结果为准。页面中的场景图、设备图和空间关系为 AI 生成示意图，不代表真实基地、设备比例或企业布局。',
    },
  ],
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
  const infoOverlay = pkg.infoOverlay ?? DEFAULT_INFO_OVERLAY
  const [title, setTitle] = useState(pkg.title)
  const [version, setVersion] = useState(pkg.version)
  const [description, setDescription] = useState(pkg.description || '')
  const [resolution, setResolution] = useState(pkg.resolution || '16:9')
  const [visualStyle, setVisualStyle] = useState(pkg.visualStyle || '')
  const [transitionStyle, setTransitionStyle] = useState(pkg.transitionStyle || '')
  const [style, setStyle] = useState(pkg.style || 'morandi-journal')
  const [infoTitle, setInfoTitle] = useState(infoOverlay.title || DEFAULT_INFO_OVERLAY.title)
  const [sourceHeading, setSourceHeading] = useState(infoOverlay.sections?.[0]?.heading || DEFAULT_INFO_OVERLAY.sections[0].heading)
  const [sourceBody, setSourceBody] = useState(infoOverlay.sections?.[0]?.body || DEFAULT_INFO_OVERLAY.sections[0].body)
  const [disclaimerHeading, setDisclaimerHeading] = useState(infoOverlay.sections?.[1]?.heading || DEFAULT_INFO_OVERLAY.sections[1].heading)
  const [disclaimerBody, setDisclaimerBody] = useState(infoOverlay.sections?.[1]?.body || DEFAULT_INFO_OVERLAY.sections[1].body)

  return (
    <div>
      <Field label="标题" value={title} onChange={setTitle} />
      <Field label="版本" value={version} onChange={setVersion} />
      <Field label="描述" value={description} onChange={setDescription} multiline />
      <SelectField label="画面比例" value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} />
      <SelectField label="信息图风格" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
      <Field label="画面风格 (补充)" value={visualStyle} onChange={setVisualStyle} multiline />
      <Field label="转场风格" value={transitionStyle} onChange={setTransitionStyle} multiline />
      <Text fontSize="2xs" fontWeight="600" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mt="6" mb="3">
        顶部说明弹窗
      </Text>
      <Field label="弹窗标题" value={infoTitle} onChange={setInfoTitle} />
      <Field label="第一段标题" value={sourceHeading} onChange={setSourceHeading} />
      <Field label="第一段内容" value={sourceBody} onChange={setSourceBody} multiline rows={5} />
      <Field label="第二段标题" value={disclaimerHeading} onChange={setDisclaimerHeading} />
      <Field label="第二段内容" value={disclaimerBody} onChange={setDisclaimerBody} multiline rows={6} />
      <SaveButton
        saving={saving}
        onClick={() => onSave({
          title,
          version,
          description,
          resolution,
          style,
          visualStyle,
          transitionStyle,
          infoOverlay: {
            title: infoTitle.trim() || DEFAULT_INFO_OVERLAY.title,
            sections: [
              {
                heading: sourceHeading.trim() || DEFAULT_INFO_OVERLAY.sections[0].heading,
                body: sourceBody.trim() || DEFAULT_INFO_OVERLAY.sections[0].body,
              },
              {
                heading: disclaimerHeading.trim() || DEFAULT_INFO_OVERLAY.sections[1].heading,
                body: disclaimerBody.trim() || DEFAULT_INFO_OVERLAY.sections[1].body,
              },
            ],
          },
        })}
      />
    </div>
  )
}
