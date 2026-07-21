/**
 * CatalogToolbar — Save button (and pending-state label).
 */
import { Download, Eye, Save, Layers } from 'lucide-react'
import { Button, Flex, HStack, Text } from '@chakra-ui/react'

interface Props {
  onSave: () => void
  onPreview: () => void
  onDownload: () => void
  isSaving: boolean
  exportOperation: 'preview' | 'download' | null
  isDirty: boolean
  hasUnsavedKnowledge?: boolean
  hasUnsavedPanorama?: boolean
  hasUnsavedConfig?: boolean
}

export function CatalogToolbar({
  onSave,
  onPreview,
  onDownload,
  isSaving,
  exportOperation,
  isDirty,
  hasUnsavedKnowledge = false,
  hasUnsavedPanorama = false,
  hasUnsavedConfig = false,
}: Props): JSX.Element {
  const segments = [
    hasUnsavedKnowledge && 'knowledge',
    hasUnsavedPanorama && 'panorama',
    hasUnsavedConfig && 'config',
  ].filter(Boolean)
  return (
    <Flex
      as="div"
      data-testid="catalog-toolbar"
      className="ui-chrome"
      align="center"
      justify="space-between"
      h="11"
      px="4"
      bg="bg.raised"
      borderBottomWidth="1px"
      borderColor="border"
      flexShrink="0"
    >
      <HStack align="center" gap="2" fontSize="12px" color="ink.muted">
        <Layers size={14} strokeWidth={1.75} />
        <Text>Catalog 编辑器</Text>
        <Text
          fontFamily="mono"
          fontSize="10px"
          color={isDirty ? 'state.warn' : 'ink.faint'}
          ml="2"
          data-testid="catalog-dirty"
        >
          {isDirty ? `${segments.join(' · ')} 待保存` : 'all synced'}
        </Text>
      </HStack>
      <HStack align="center" gap="2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
          loading={exportOperation === 'preview'}
          disabled={exportOperation !== null && exportOperation !== 'preview'}
          data-testid="btn-generate-preview"
        >
          <HStack gap="1.5">
            <Eye size={14} />
            生成预览
          </HStack>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDownload}
          loading={exportOperation === 'download'}
          disabled={exportOperation !== null && exportOperation !== 'download'}
          data-testid="btn-download-zip"
        >
          <HStack gap="1.5">
            <Download size={14} />
            下载 ZIP
          </HStack>
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={onSave}
          loading={isSaving && exportOperation === null}
          disabled={exportOperation !== null}
          data-testid="btn-save"
        >
          <HStack gap="1.5">
            <Save size={14} />
            {isDirty ? '保存' : '已保存'}
          </HStack>
        </Button>
      </HStack>
    </Flex>
  )
}
