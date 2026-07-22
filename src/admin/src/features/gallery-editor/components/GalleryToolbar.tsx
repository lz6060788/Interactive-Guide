import { Badge, Button, Flex, HStack, Switch, Text } from '@chakra-ui/react'
import { Download, Eye, Images, Save } from 'lucide-react'

interface GalleryToolbarProps {
  boundCount: number
  itemCount: number
  enabled: boolean
  isDirty: boolean
  isSaving: boolean
  exportOperation: 'preview' | 'download' | null
  onEnabledChange: (enabled: boolean) => void
  onPreview: () => void
  onDownload: () => void
  onSave: () => void
}

export function GalleryToolbar({
  boundCount,
  itemCount,
  enabled,
  isDirty,
  isSaving,
  exportOperation,
  onEnabledChange,
  onPreview,
  onDownload,
  onSave,
}: GalleryToolbarProps): JSX.Element {
  const complete = itemCount > 0 && boundCount === itemCount
  return (
    <Flex
      className="ui-chrome"
      data-testid="gallery-toolbar"
      align="center"
      justify="space-between"
      h="11"
      px="4"
      flexShrink="0"
      bg="bg.raised"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <HStack gap="2" color="ink.muted">
        <Images size={14} strokeWidth={1.75} />
        <Text fontSize="12px">Gallery 编辑器</Text>
        <Badge
          variant="subtle"
          colorPalette={complete ? 'green' : 'orange'}
          fontFamily="mono"
          fontSize="10px"
        >
          {boundCount}/{itemCount} 图片
        </Badge>
        <Text
          data-testid="gallery-dirty"
          ml="1"
          fontFamily="mono"
          fontSize="10px"
          color={isDirty ? 'state.warn' : 'ink.faint'}
        >
          {isDirty ? '待保存' : 'all synced'}
        </Text>
        <Switch.Root
          checked={enabled}
          onCheckedChange={details => onEnabledChange(Boolean(details.checked))}
          colorPalette="brand"
          size="sm"
          ml="2"
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label fontSize="12px">纳入正式发布</Switch.Label>
        </Switch.Root>
      </HStack>
      <HStack gap="2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
          loading={exportOperation === 'preview'}
          disabled={!complete || (exportOperation !== null && exportOperation !== 'preview')}
          data-testid="btn-generate-preview"
        >
          <Eye size={14} />
          生成预览
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDownload}
          loading={exportOperation === 'download'}
          disabled={!complete || (exportOperation !== null && exportOperation !== 'download')}
          data-testid="btn-download-zip"
        >
          <Download size={14} />
          下载 ZIP
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={onSave}
          loading={isSaving && exportOperation === null}
          disabled={exportOperation !== null}
          data-testid="btn-save"
        >
          <Save size={14} />
          {isDirty ? '保存' : '已保存'}
        </Button>
      </HStack>
    </Flex>
  )
}
