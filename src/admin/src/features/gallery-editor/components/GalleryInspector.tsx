import {
  Badge,
  Box,
  Button,
  Field,
  HStack,
  Image,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { ImagePlus, Link2, Settings2, Upload } from 'lucide-react'
import type {
  GalleryProductConfig,
  GuideProject,
  IndustryCategory,
  IndustryItem,
} from '@domain/project-types'
import { readLocalizedText, setLocalizedText } from '@domain/localization'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'
import type { GalleryEditorSelection } from '../types'

interface GalleryInspectorProps {
  project: GuideProject
  selection: GalleryEditorSelection
  locale: string
  isUploading: boolean
  onPatchGallery: (mutator: (config: GalleryProductConfig) => GalleryProductConfig) => void
  onPatchCategory: (
    categoryId: string,
    mutator: (category: IndustryCategory) => IndustryCategory,
  ) => void
  onPatchItem: (itemId: string, mutator: (item: IndustryItem) => IndustryItem) => void
  onUploadItemImage: (itemId: string, file: File) => void
}

export function GalleryInspector({
  project,
  selection,
  locale,
  isUploading,
  onPatchGallery,
  onPatchCategory,
  onPatchItem,
  onUploadItemImage,
}: GalleryInspectorProps): JSX.Element {
  const category =
    selection?.kind === 'category'
      ? project.knowledge.stages
          .flatMap(stage => stage.categories)
          .find(candidate => candidate.id === selection.id)
      : undefined
  const item = selection?.kind === 'item' ? project.knowledge.items[selection.id] : undefined

  return (
    <Box
      as="aside"
      data-testid="gallery-inspector"
      h="100%"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      bg="bg.raised"
      borderLeftWidth="1px"
      borderColor="border"
    >
      <Box px="4" py="3" borderBottomWidth="1px" borderColor="border">
        <Text className="eyebrow">Inspector</Text>
        <Text mt="0.5" fontSize="15px" fontWeight="600" color="ink" truncate>
          {category
            ? readLocalizedText(category.title, locale)
            : item
              ? readLocalizedText(item.title, locale)
              : 'Gallery 配置'}
        </Text>
        {selection && (
          <Text mt="0.5" fontFamily="mono" fontSize="10px" color="ink.faint">
            {selection.id}
          </Text>
        )}
      </Box>

      <Stack flex="1" overflowY="auto" gap="0">
        {category && (
          <InspectorSection icon={<Settings2 size={12} />} title="二级节点">
            <GalleryField label="节点标题">
              <Input
                value={readLocalizedText(category.title, locale)}
                onChange={event =>
                  onPatchCategory(category.id, current => ({
                    ...current,
                    title: setLocalizedText(current.title, locale, event.target.value),
                  }))
                }
                size="sm"
                bg="bg.raised"
              />
            </GalleryField>
            <GalleryField label="节点描述">
              <Textarea
                value={readLocalizedText(category.description, locale)}
                onChange={event =>
                  onPatchCategory(category.id, current => ({
                    ...current,
                    description: setLocalizedText(current.description, locale, event.target.value),
                  }))
                }
                minH="84px"
                size="sm"
                bg="bg.raised"
              />
            </GalleryField>
            <GalleryField label="排序">
              <Input
                type="number"
                min={0}
                max={999}
                value={category.order}
                onChange={event =>
                  onPatchCategory(category.id, current => ({
                    ...current,
                    order: Number(event.target.value) || 0,
                  }))
                }
                size="sm"
                bg="bg.raised"
                fontFamily="mono"
              />
            </GalleryField>
            <HStack justify="space-between">
              <Text fontSize="12px" color="ink.muted">
                三级节点
              </Text>
              <Badge variant="subtle" colorPalette="gray" fontFamily="mono">
                {category.itemIds.length}
              </Badge>
            </HStack>
          </InspectorSection>
        )}

        {item && (
          <ItemInspector
            project={project}
            item={item}
            locale={locale}
            isUploading={isUploading}
            onPatchItem={onPatchItem}
            onPatchGallery={onPatchGallery}
            onUploadItemImage={onUploadItemImage}
          />
        )}

        {!category && !item && (
          <Box px="4" py="5">
            <Text fontSize="13px" color="ink.muted" lineHeight="1.6">
              从左侧选择二级或三级节点进行编辑。
            </Text>
          </Box>
        )}

        <InspectorSection icon={<Link2 size={12} />} title="产物配置">
          <GalleryField label="底部提示">
            <Input
              value={readLocalizedText(project.products.gallery.hintText, locale)}
              onChange={event =>
                onPatchGallery(config => ({
                  ...config,
                  hintText: setLocalizedText(config.hintText, locale, event.target.value),
                }))
              }
              size="sm"
              bg="bg.raised"
            />
          </GalleryField>
          <GalleryField
            label="Atlas 完整链接（可选）"
            helper="配置后产物右下角才显示打开 Atlas 按钮。"
          >
            <Input
              value={project.products.gallery.atlasLaunchUrl ?? ''}
              placeholder="https://example.com/atlas/index.html"
              onChange={event =>
                onPatchGallery(config => ({
                  ...config,
                  atlasLaunchUrl: event.target.value.trim() || undefined,
                }))
              }
              size="sm"
              bg="bg.raised"
            />
          </GalleryField>
        </InspectorSection>
      </Stack>
    </Box>
  )
}

function ItemInspector({
  project,
  item,
  locale,
  isUploading,
  onPatchItem,
  onPatchGallery,
  onUploadItemImage,
}: {
  project: GuideProject
  item: IndustryItem
  locale: string
  isUploading: boolean
  onPatchItem: (itemId: string, mutator: (item: IndustryItem) => IndustryItem) => void
  onPatchGallery: (mutator: (config: GalleryProductConfig) => GalleryProductConfig) => void
  onUploadItemImage: (itemId: string, file: File) => void
}): JSX.Element {
  const imageAssets = Object.values(project.assets.byId)
    .filter(asset => asset.kind === 'image')
    .sort((left, right) => left.id.localeCompare(right.id))
  const boundAssetId = project.products.gallery.itemImageAssetIds[item.id] ?? ''
  const boundAsset = project.assets.byId[boundAssetId]
  const resolveAssetUrl = createProjectAssetUrlResolver(project)
  const category = project.knowledge.stages
    .flatMap(stage => stage.categories)
    .find(candidate => candidate.id === item.categoryId)

  return (
    <>
      <InspectorSection icon={<Settings2 size={12} />} title="三级节点">
        <GalleryField label="节点标题">
          <Input
            value={readLocalizedText(item.title, locale)}
            onChange={event =>
              onPatchItem(item.id, current => ({
                ...current,
                title: setLocalizedText(current.title, locale, event.target.value),
              }))
            }
            size="sm"
            bg="bg.raised"
          />
        </GalleryField>
        <GalleryField label="节点描述">
          <Textarea
            value={readLocalizedText(item.description, locale)}
            onChange={event =>
              onPatchItem(item.id, current => ({
                ...current,
                description: setLocalizedText(current.description, locale, event.target.value),
              }))
            }
            minH="96px"
            size="sm"
            bg="bg.raised"
          />
        </GalleryField>
        <HStack justify="space-between">
          <Text fontSize="11px" color="ink.faint">
            所属二级节点
          </Text>
          <Text fontSize="11px" color="ink.muted">
            {category ? readLocalizedText(category.title, locale) : item.categoryId}
          </Text>
        </HStack>
        <GalleryField label="排序">
          <Input
            type="number"
            min={0}
            max={999}
            value={item.order}
            onChange={event =>
              onPatchItem(item.id, current => ({
                ...current,
                order: Number(event.target.value) || 0,
              }))
            }
            size="sm"
            bg="bg.raised"
            fontFamily="mono"
          />
        </GalleryField>
      </InspectorSection>

      <InspectorSection icon={<ImagePlus size={12} />} title="节点图片">
        {boundAsset?.kind === 'image' && (
          <Box
            h="112px"
            p="2"
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="bg.sunken"
            borderWidth="1px"
            borderColor="border"
            borderRadius="md"
            overflow="hidden"
          >
            <Image
              src={resolveAssetUrl(project.id, boundAsset.sourcePath)}
              alt={readLocalizedText(item.title, locale)}
              maxW="100%"
              maxH="100%"
              objectFit="contain"
            />
          </Box>
        )}
        <GalleryField label="已绑定资源">
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={boundAssetId}
              onChange={event => {
                const assetId = event.target.value
                onPatchGallery(config => {
                  if (assetId) {
                    return {
                      ...config,
                      itemImageAssetIds: { ...config.itemImageAssetIds, [item.id]: assetId },
                    }
                  }
                  const { [item.id]: _removed, ...itemImageAssetIds } = config.itemImageAssetIds
                  return { ...config, itemImageAssetIds }
                })
              }}
              bg="bg.raised"
              borderColor="border"
            >
              <option value="">未绑定</option>
              {imageAssets.map(asset => (
                <option key={asset.id} value={asset.id}>
                  {asset.id}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </GalleryField>
        <Button asChild variant="secondary" size="sm" borderStyle="dashed" disabled={isUploading}>
          <label>
            <Upload size={13} />
            {isUploading ? '上传中…' : '上传并绑定新图片'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={isUploading}
              onChange={event => {
                const file = event.target.files?.[0]
                if (file) onUploadItemImage(item.id, file)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </Button>
      </InspectorSection>
    </>
  )
}

function InspectorSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <Box px="4" py="3" borderBottomWidth="1px" borderColor="border">
      <HStack gap="1.5" mb="2.5" color="ink.faint">
        {icon}
        <Text className="eyebrow" fontSize="10px">
          {title}
        </Text>
      </HStack>
      <Stack gap="2.5">{children}</Stack>
    </Box>
  )
}

function GalleryField({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <Field.Root>
      <Field.Label fontSize="12px" color="ink.muted">
        {label}
      </Field.Label>
      {children}
      {helper && (
        <Field.HelperText fontSize="10px" color="ink.faint" lineHeight="1.5">
          {helper}
        </Field.HelperText>
      )}
    </Field.Root>
  )
}
