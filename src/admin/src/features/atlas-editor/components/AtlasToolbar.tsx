/**
 * AtlasToolbar — the canvas-mode toolbar above the canvas + preview.
 *
 * Tools:
 *   V (select)  — click to select an existing hotspot; drag to pan
 *   M (marker)  — click to drop a hotspot at the cursor
 *   C (callout) — click an existing hotspot to attach a callout to it
 *
 * Save / Publish sit on the right. Save persists the in-flight mutations
 * via a single PATCH per logical sub-section (panorama / atlas config).
 *
 * Note: there's no separate "Pan" tool button — panning the canvas is
 * built into the Select tool (drag empty canvas area).
 */
import { MousePointer2, MapPin, MessageSquare, Save, Eye, Rocket } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, Flex, HStack, Text } from '@chakra-ui/react'

export type Tool = 'select' | 'marker' | 'callout'

interface Props {
  tool: Tool
  onToolChange: (t: Tool) => void
  onSave: () => void
  onPreview?: () => void
  onPublish?: () => void
  isSaving: boolean
  isDirty: boolean
  hasUnsavedPanorama: boolean
  hasUnsavedConfig: boolean
  hasUnsavedKnowledge?: boolean
  hasUnsavedNavigation?: boolean
}

interface ToolDef {
  id: Tool
  label: string
  shortcut: string
  icon: LucideIcon
  hint: string
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: '选择', shortcut: 'V', icon: MousePointer2, hint: '点击选择已有 hotspot，拖拽平移画面' },
  { id: 'marker', label: 'Hotspot', shortcut: 'M', icon: MapPin, hint: '点击画布放置分类 hotspot' },
  { id: 'callout', label: 'Callout', shortcut: 'C', icon: MessageSquare, hint: '选中 hotspot 后开启/编辑 callout' },
]

export function AtlasToolbar({
  tool,
  onToolChange,
  onSave,
  onPreview,
  onPublish,
  isSaving,
  isDirty,
  hasUnsavedPanorama,
  hasUnsavedConfig,
  hasUnsavedKnowledge = false,
  hasUnsavedNavigation = false,
}: Props): JSX.Element {
  return (
    <Flex
      as="div"
      data-testid="atlas-toolbar"
      className="ui-chrome"
      align="center"
      justify="space-between"
      h="11"
      px="3"
      bg="bg.raised"
      borderBottomWidth="1px"
      borderColor="border"
      flexShrink="0"
    >
      <HStack align="center" gap="1">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.id}
            icon={t.icon}
            label={t.label}
            shortcut={t.shortcut}
            active={tool === t.id}
            onClick={() => onToolChange(t.id)}
            title={t.hint}
            testid={`tool-${t.id === 'select' ? 'select' : t.id}`}
          />
        ))}
      </HStack>
      <HStack align="center" gap="2">
        {(hasUnsavedPanorama || hasUnsavedConfig || hasUnsavedKnowledge || hasUnsavedNavigation) && (
          <Text
            fontFamily="mono"
            fontSize="10px"
            color="state.warn"
            letterSpacing="0.04em"
            data-testid="dirty-summary"
          >
            {[
              hasUnsavedKnowledge && 'knowledge',
              hasUnsavedPanorama && 'panorama',
              hasUnsavedNavigation && 'navigation',
              hasUnsavedConfig && 'config',
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            待保存
          </Text>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
          disabled={!onPreview}
        >
          <HStack gap="1.5">
            <Eye size={14} />
            预览
          </HStack>
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={onSave}
          loading={isSaving}
          data-testid="btn-save"
        >
          <HStack gap="1.5">
            <Save size={14} />
            {isDirty ? '保存' : '已保存'}
          </HStack>
        </Button>
        <Button variant="primary" size="sm" onClick={onPublish} disabled>
          <HStack gap="1.5">
            <Rocket size={14} />
            发布
          </HStack>
        </Button>
      </HStack>
    </Flex>
  )
}

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  shortcut: string
  active: boolean
  onClick: () => void
  title: string
  testid: string
}

function ToolButton({ icon: IconComp, label, shortcut, active, onClick, title, testid }: ToolButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testid}
      data-active={active ? 'true' : 'false'}
      data-interactive="true"
      className="icon-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 8px 0 10px',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      <IconComp size={14} strokeWidth={1.75} />
      <Text as="span">{label}</Text>
      <Kbd>{shortcut}</Kbd>
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Text
      as="kbd"
      className="mono"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      minW="4"
      h="4"
      px="1"
      fontSize="10px"
      fontWeight="500"
      color="ink.faint"
      bg="bg.raised"
      borderWidth="1px"
      borderColor="border"
      borderRadius="xs"
      boxShadow="0 1px 0 var(--ig-colors-border)"
      lineHeight="1"
    >
      {children}
    </Text>
  )
}
