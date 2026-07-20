/**
 * CatalogInspector — right-rail properties pane.
 *
 * Three sections:
 *   - Project-wide Catalog config (when no selection)
 *   - Category metadata (when a category is selected)
 *   - Item metadata (when an item is selected)
 *
 * All edits flow to the parent through onPatchCatalogConfig /
 * onPatchKnowledge. The form is a "direct mode" view — each field
 * commits to the draft on change rather than buffering through RHF.
 */
import { useEffect, useMemo, useState } from 'react'
import { Settings2, Sliders, FileText, MapPin, Tag, MousePointer2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  GuideProject,
  IndustryStage,
  CatalogProductConfig,
  IndustryItem,
  PanoramaModel,
  Viewport,
} from '@domain/project-types'
import {
  Box,
  Button,
  EmptyState,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import type { CatalogSelection } from '../store'
import { localized, updateLocalized } from '../../projects/localization'

interface Props {
  project: GuideProject
  selection: CatalogSelection
  activeStage: IndustryStage
  onPatchCatalogConfig: (mutator: (cfg: CatalogProductConfig) => CatalogProductConfig) => void
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void
  onSaveRequested: () => void
  hasUnsavedConfig: boolean
  isSaving: boolean
  locale: string
}

export function CatalogInspector({
  project,
  selection,
  activeStage,
  onPatchCatalogConfig,
  onPatchKnowledge,
  onPatchPanorama,
  onSaveRequested,
  hasUnsavedConfig,
  isSaving,
  locale,
}: Props): JSX.Element {
  const mode = useMemo(() => {
    if (selection?.kind === 'category') return 'category'
    if (selection?.kind === 'item') return 'item'
    return 'config'
  }, [selection])

  return (
    <Box
      as="aside"
      data-testid="catalog-inspector"
      data-mode={mode}
      h="100%"
      bg="bg.raised"
      borderLeftWidth="1px"
      borderColor="border"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      {mode === 'config' && (
        <ConfigInspector
          project={project}
          onPatch={onPatchCatalogConfig}
          hasUnsaved={hasUnsavedConfig}
          onSaveRequested={onSaveRequested}
          isSaving={isSaving}
          locale={locale}
        />
      )}
      {mode === 'category' && selection?.kind === 'category' && (
        <CategoryInspector
          project={project}
          categoryId={selection.id}
          activeStage={activeStage}
          onPatchKnowledge={onPatchKnowledge}
          onPatchPanorama={onPatchPanorama}
          locale={locale}
        />
      )}
      {mode === 'item' && selection?.kind === 'item' && (
        <ItemInspector
          project={project}
          itemId={selection.id}
          activeStage={activeStage}
          onPatchKnowledge={onPatchKnowledge}
          onPatchPanorama={onPatchPanorama}
          locale={locale}
        />
      )}
    </Box>
  )
}

// ─── Config Inspector ────────────────────────────────────

interface ConfigInspectorProps {
  project: GuideProject
  onPatch: (mutator: (cfg: CatalogProductConfig) => CatalogProductConfig) => void
  hasUnsaved: boolean
  onSaveRequested: () => void
  isSaving: boolean
  locale: string
}

function ConfigInspector({
  project,
  onPatch,
  hasUnsaved,
  onSaveRequested,
  isSaving,
  locale,
}: ConfigInspectorProps): JSX.Element {
  const cfg = project.products.catalog
  const subscribe = (mutator: (cfg: CatalogProductConfig) => CatalogProductConfig) => {
    onPatch(mutator)
  }

  return (
    <>
      <SectionHeader
        eyebrow="Project-wide"
        title="Catalog 配置"
        actions={
          hasUnsaved ? (
            <Button
              variant="brand"
              size="sm"
              onClick={onSaveRequested}
              loading={isSaving}
              data-testid="btn-save-config"
            >
              保存
            </Button>
          ) : null
        }
      />
      <Stack flex="1" overflow="auto" gap="0">
        <FieldGroup icon={FileText} title="说明">
          <TextFieldPlain
            label="顶部提示语"
            value={localized(cfg.hintText, locale)}
            placeholder="例如：滑动浏览，点选进入"
            onChange={v =>
              subscribe(c => ({ ...c, hintText: updateLocalized(c.hintText, locale, v) }))
            }
          />
          <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
            出现在列表上方的提示文本
          </Text>
          <TextFieldPlain
            label="Atlas 完整地址"
            value={cfg.atlasLaunchUrl ?? ''}
            placeholder="https://example.com/atlas/index.html"
            onChange={v => subscribe(c => ({ ...c, atlasLaunchUrl: v.trim() || undefined }))}
          />
          <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
            配置后，Catalog 右下角显示“打开全景图”，F10 环境会调用全屏跳转。
          </Text>
        </FieldGroup>

        <FieldGroup icon={Sliders} title="列表与焦点">
          <LabeledSelect
            label="列表密度"
            value={cfg.theme.listDensity}
            options={[
              { value: 'comfortable', label: '舒适' },
              { value: 'compact', label: '紧凑' },
            ]}
            onChange={v =>
              subscribe(c => ({
                ...c,
                theme: { ...c.theme, listDensity: v as typeof c.theme.listDensity },
              }))
            }
          />
          <LabeledSelect
            label="焦点形式"
            value={cfg.theme.focusVariant}
            options={[
              { value: 'rect', label: '矩形' },
              { value: 'pill', label: '胶囊' },
            ]}
            onChange={v =>
              subscribe(c => ({
                ...c,
                theme: { ...c.theme, focusVariant: v as typeof c.theme.focusVariant },
              }))
            }
          />
          <NumberFieldPlain
            label="遮罩不透明度"
            value={cfg.theme.maskOpacity ?? 0.6}
            min={0}
            max={1}
            step={0.05}
            onChange={v =>
              subscribe(c => ({
                ...c,
                theme: { ...c.theme, maskOpacity: v },
              }))
            }
          />
        </FieldGroup>

        <FieldGroup icon={Settings2} title="视口与交互">
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="宽度 (px)"
                value={cfg.viewport.width}
                min={240}
                max={2400}
                onChange={v => subscribe(c => ({ ...c, viewport: { ...c.viewport, width: v } }))}
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="高度 (px)"
                value={cfg.viewport.height}
                min={320}
                max={4000}
                onChange={v => subscribe(c => ({ ...c, viewport: { ...c.viewport, height: v } }))}
              />
            </Box>
          </HStack>
          <NumberFieldPlain
            label="切换动画时长 (ms)"
            value={cfg.interaction.viewportAnimationMs}
            min={0}
            max={2000}
            step={20}
            onChange={v =>
              subscribe(c => ({
                ...c,
                interaction: { ...c.interaction, viewportAnimationMs: v },
              }))
            }
          />
          <ChakraToggleRow
            label="点选 marker 激活"
            checked={cfg.interaction.markerActivation}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                interaction: {
                  ...c.interaction,
                  markerActivation: !c.interaction.markerActivation,
                },
              }))
            }
          />
        </FieldGroup>

        <FieldGroup icon={Tag} title="Chrome">
          <ChakraToggleRow
            label="工具栏"
            checked={cfg.chrome.showToolbar ?? false}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                chrome: { ...c.chrome, showToolbar: !(c.chrome.showToolbar ?? false) },
              }))
            }
          />
          <ChakraToggleRow
            label="缩放指示"
            checked={cfg.chrome.showZoomIndicator ?? false}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                chrome: {
                  ...c.chrome,
                  showZoomIndicator: !(c.chrome.showZoomIndicator ?? false),
                },
              }))
            }
          />
          <ChakraToggleRow
            label="提示语"
            checked={cfg.chrome.showHints ?? false}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                chrome: { ...c.chrome, showHints: !(c.chrome.showHints ?? false) },
              }))
            }
          />
        </FieldGroup>
      </Stack>
    </>
  )
}

// ─── Category Inspector ─────────────────────────────────

interface CategoryInspectorProps {
  project: GuideProject
  categoryId: string
  activeStage: IndustryStage
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void
  locale: string
}

function CategoryInspector({
  project,
  categoryId,
  activeStage,
  onPatchKnowledge,
  onPatchPanorama,
  locale,
}: CategoryInspectorProps): JSX.Element {
  const cat = activeStage.categories.find(c => c.id === categoryId)
  if (!cat) {
    return (
      <EmptyState.Root>
        <EmptyState.Indicator>
          <MousePointer2 size={36} strokeWidth={1.25} color="ink.faint" />
        </EmptyState.Indicator>
        <EmptyState.Title>分类不存在</EmptyState.Title>
        <EmptyState.Description>可能在另一个标签页被删除了。</EmptyState.Description>
      </EmptyState.Root>
    )
  }

  return (
    <>
      <SectionHeader eyebrow="Category" title={localized(cat.title, locale)} />
      <Box px="4" pb="2">
        <Text fontFamily="mono" fontSize="11px" color="ink.faint">
          {cat.id}
        </Text>
      </Box>
      <Stack flex="1" overflow="auto" gap="0">
        <FieldGroup icon={MapPin} title="分类信息">
          <TextFieldPlain
            label="标题"
            value={localized(cat.title, locale)}
            onChange={t => {
              onPatchKnowledge(k => {
                const stages = k.stages as unknown as IndustryStage[]
                return {
                  ...k,
                  stages: stages.map(s => ({
                    ...s,
                    categories: s.categories.map(c =>
                      c.id === cat.id ? { ...c, title: updateLocalized(c.title, locale, t) } : c,
                    ),
                  })),
                } as GuideProject['knowledge']
              })
            }}
          />
          <NumberFieldPlain
            label="排序"
            value={cat.order}
            min={0}
            max={999}
            onChange={v => {
              onPatchKnowledge(k => {
                const stages = k.stages as unknown as IndustryStage[]
                return {
                  ...k,
                  stages: stages.map(s => ({
                    ...s,
                    categories: s.categories.map(c => (c.id === cat.id ? { ...c, order: v } : c)),
                  })),
                } as GuideProject['knowledge']
              })
            }}
          />
          <LabeledSelect
            label="体验形式"
            value={cat.experience.kind}
            options={[
              { value: 'panorama', label: 'Panorama 全景' },
              { value: 'html-scene', label: 'HTML Scene' },
            ]}
            onChange={v => {
              onPatchKnowledge(k => patchExperience(k, cat.id, v as 'panorama' | 'html-scene'))
            }}
          />
          {cat.experience.kind === 'html-scene' &&
            (() => {
              const exp = cat.experience
              return (
                <>
                  <LabeledSelect
                    label="场景"
                    value={exp.sceneId}
                    options={
                      project.scenes.length === 0
                        ? [{ value: '', label: '（暂无场景，先去 Settings 创建）' }]
                        : [
                            { value: '', label: '请选择…' },
                            ...project.scenes.map(s => ({
                              value: s.id,
                              label: localized(s.title, locale) || s.id,
                            })),
                          ]
                    }
                    onChange={v =>
                      onPatchKnowledge(k => patchExperience(k, cat.id, 'html-scene', v))
                    }
                  />
                  <LabeledSelect
                    label="视图"
                    value={exp.viewId}
                    options={(() => {
                      const scene = project.scenes.find(s => s.id === exp.sceneId)
                      if (!scene) return [{ value: '', label: '（请先选场景）' }]
                      if (scene.views.length === 0) return [{ value: '', label: '（场景无视图）' }]
                      return [
                        { value: '', label: '请选择…' },
                        ...scene.views.map(v => ({
                          value: v.id,
                          label: localized(v.title, locale) || v.id,
                        })),
                      ]
                    })()}
                    onChange={v =>
                      onPatchKnowledge(k => patchExperience(k, cat.id, 'html-scene', undefined, v))
                    }
                  />
                  <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
                    HTML 场景需先在 Settings → HTML 场景 上传 zip 包并创建视图，再回到这里绑定。
                  </Text>
                </>
              )
            })()}
        </FieldGroup>

        <FieldGroup icon={Sliders} title="共享背景镜头">
          <Text fontSize="11px" color="ink.faint">
            当前二级分类下的三级节点默认共用此背景画面。
          </Text>
          <HStack gap="2">
            <Box flex="1">
              <NumberFieldPlain
                label="中心 x"
                value={project.panorama.categories[cat.id]?.viewport.centerX ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchCategoryViewport(onPatchPanorama, cat.id, current => ({
                    ...current,
                    centerX: v,
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="中心 y"
                value={project.panorama.categories[cat.id]?.viewport.centerY ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchCategoryViewport(onPatchPanorama, cat.id, current => ({
                    ...current,
                    centerY: v,
                  }))
                }
              />
            </Box>
          </HStack>
          <NumberFieldPlain
            label="放大倍数"
            value={project.panorama.categories[cat.id]?.viewport.zoom ?? 1}
            min={project.panorama.cameraBounds.minZoom}
            max={project.panorama.cameraBounds.maxZoom}
            step={0.1}
            onChange={v =>
              patchCategoryViewport(onPatchPanorama, cat.id, current => ({ ...current, zoom: v }))
            }
          />
        </FieldGroup>

        <FieldGroup icon={Tag} title="项目数">
          <Text fontFamily="mono" fontSize="12px" color="ink.muted">
            共 {cat.itemIds.length} 个项目
          </Text>
        </FieldGroup>
      </Stack>
    </>
  )
}

// ─── Item Inspector ─────────────────────────────────────

interface ItemInspectorProps {
  project: GuideProject
  itemId: string
  activeStage: IndustryStage
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void
  locale: string
}

function ItemInspector({
  project,
  itemId,
  activeStage,
  onPatchKnowledge,
  onPatchPanorama,
  locale,
}: ItemInspectorProps): JSX.Element {
  const item: IndustryItem | undefined = project.knowledge.items[itemId]
  const cat = activeStage.categories.find(c => c.id === item?.categoryId)
  const layout = project.panorama.items[itemId]

  if (!item) {
    return (
      <EmptyState.Root>
        <EmptyState.Indicator>
          <MousePointer2 size={36} strokeWidth={1.25} color="ink.faint" />
        </EmptyState.Indicator>
        <EmptyState.Title>项目不存在</EmptyState.Title>
        <EmptyState.Description>可能在另一个标签页被删除了。</EmptyState.Description>
      </EmptyState.Root>
    )
  }

  return (
    <>
      <SectionHeader eyebrow="Item" title={localized(item.title, locale)} />
      <Box px="4" pb="2">
        <Text fontFamily="mono" fontSize="11px" color="ink.faint">
          {item.id}
        </Text>
      </Box>
      <Stack flex="1" overflow="auto" gap="0">
        <FieldGroup icon={MapPin} title="项目信息">
          <TextFieldPlain
            label="标题"
            value={localized(item.title, locale)}
            onChange={t => {
              onPatchKnowledge(k => ({
                ...k,
                items: {
                  ...k.items,
                  [itemId]: { ...item, title: updateLocalized(item.title, locale, t) },
                },
              }))
            }}
          />
          <Text fontFamily="mono" fontSize="11px" color="ink.faint">
            所属分类：{cat ? localized(cat.title, locale) : item.categoryId}
          </Text>
          <TextFieldPlain
            label="描述"
            value={localized(item.description, locale)}
            onChange={d => {
              onPatchKnowledge(k => ({
                ...k,
                items: {
                  ...k.items,
                  [itemId]: {
                    ...item,
                    description: updateLocalized(item.description, locale, d),
                  },
                },
              }))
            }}
          />
        </FieldGroup>

        <FieldGroup icon={Tag} title="排序">
          <NumberFieldPlain
            label="顺序"
            value={item.order}
            min={0}
            max={999}
            onChange={v => {
              onPatchKnowledge(k => ({
                ...k,
                items: { ...k.items, [itemId]: { ...item, order: v } },
              }))
            }}
          />
        </FieldGroup>

        <FieldGroup icon={Sliders} title="场景定位">
          <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
            可直接在中间画布拖拽 marker 和聚焦区域；此处用于精确校准。
          </Text>
          <HStack gap="2">
            <Box flex="1">
              <NumberFieldPlain
                label="marker x"
                value={layout?.marker.x ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    marker: { x: v, y: current.marker.y },
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="marker y"
                value={layout?.marker.y ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    marker: { x: current.marker.x, y: v },
                  }))
                }
              />
            </Box>
          </HStack>
          <HStack gap="2">
            <Box flex="1">
              <NumberFieldPlain
                label="聚焦 x"
                value={layout?.focusRect?.x ?? 0.35}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    focusRect: { ...(current.focusRect ?? defaultFocusRect()), x: v },
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="聚焦 y"
                value={layout?.focusRect?.y ?? 0.35}
                min={0}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    focusRect: { ...(current.focusRect ?? defaultFocusRect()), y: v },
                  }))
                }
              />
            </Box>
          </HStack>
          <HStack gap="2">
            <Box flex="1">
              <NumberFieldPlain
                label="宽度"
                value={layout?.focusRect?.width ?? 0.2}
                min={0.03}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    focusRect: { ...(current.focusRect ?? defaultFocusRect()), width: v },
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="高度"
                value={layout?.focusRect?.height ?? 0.2}
                min={0.03}
                max={1}
                step={0.01}
                onChange={v =>
                  patchItemLayout(onPatchPanorama, itemId, current => ({
                    ...current,
                    focusRect: { ...(current.focusRect ?? defaultFocusRect()), height: v },
                  }))
                }
              />
            </Box>
          </HStack>
          <ChakraToggleRow
            label="使用独立背景镜头"
            checked={Boolean(layout?.viewportOverride)}
            onToggle={() => {
              onPatchPanorama(panorama => {
                const current = panorama.items[itemId] ?? {
                  marker: { x: 0.5, y: 0.5 },
                  focusRect: defaultFocusRect(),
                }
                if (current.viewportOverride) {
                  const { viewportOverride: _override, ...withoutOverride } = current
                  return { ...panorama, items: { ...panorama.items, [itemId]: withoutOverride } }
                }
                const categoryViewport = panorama.categories[item.categoryId]?.viewport ?? {
                  centerX: 0.5,
                  centerY: 0.5,
                  zoom: 1,
                }
                return {
                  ...panorama,
                  items: {
                    ...panorama.items,
                    [itemId]: { ...current, viewportOverride: categoryViewport },
                  },
                }
              })
            }}
          />
          {layout?.viewportOverride && (
            <>
              <HStack gap="2">
                <Box flex="1">
                  <NumberFieldPlain
                    label="背景中心 x"
                    value={layout.viewportOverride.centerX}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={v =>
                      patchItemViewport(onPatchPanorama, itemId, current => ({
                        ...current,
                        centerX: v,
                      }))
                    }
                  />
                </Box>
                <Box flex="1">
                  <NumberFieldPlain
                    label="背景中心 y"
                    value={layout.viewportOverride.centerY}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={v =>
                      patchItemViewport(onPatchPanorama, itemId, current => ({
                        ...current,
                        centerY: v,
                      }))
                    }
                  />
                </Box>
              </HStack>
              <NumberFieldPlain
                label="背景放大倍数"
                value={layout.viewportOverride.zoom}
                min={project.panorama.cameraBounds.minZoom}
                max={project.panorama.cameraBounds.maxZoom}
                step={0.1}
                onChange={v =>
                  patchItemViewport(onPatchPanorama, itemId, current => ({ ...current, zoom: v }))
                }
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onPatchPanorama(panorama => ({
                    ...panorama,
                    items: {
                      ...panorama.items,
                      [itemId]: { ...panorama.items[itemId], viewportOverride: undefined },
                    },
                  }))
                }
              >
                使用分类共享背景
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onPatchPanorama(panorama => ({
                    ...panorama,
                    categories: {
                      ...panorama.categories,
                      [item.categoryId]: {
                        ...panorama.categories[item.categoryId],
                        viewport: layout.viewportOverride!,
                      },
                    },
                  }))
                }
              >
                设为分类共享背景
              </Button>
            </>
          )}
        </FieldGroup>
      </Stack>
    </>
  )
}

function patchItemLayout(
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void,
  itemId: string,
  mutator: (
    layout: NonNullable<PanoramaModel['items'][string]>,
  ) => NonNullable<PanoramaModel['items'][string]>,
): void {
  onPatchPanorama(panorama => ({
    ...panorama,
    items: {
      ...panorama.items,
      [itemId]: mutator(
        panorama.items[itemId] ?? { marker: { x: 0.5, y: 0.5 }, focusRect: defaultFocusRect() },
      ),
    },
  }))
}

function defaultFocusRect(): { x: number; y: number; width: number; height: number } {
  return { x: 0.35, y: 0.35, width: 0.2, height: 0.2 }
}

function patchCategoryViewport(
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void,
  categoryId: string,
  mutator: (viewport: Viewport) => Viewport,
): void {
  onPatchPanorama(panorama => {
    const current = panorama.categories[categoryId] ?? {
      viewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    }
    return {
      ...panorama,
      categories: {
        ...panorama.categories,
        [categoryId]: { ...current, viewport: mutator(current.viewport) },
      },
    }
  })
}

function patchItemViewport(
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void,
  itemId: string,
  mutator: (viewport: Viewport) => Viewport,
): void {
  onPatchPanorama(panorama => {
    const current = panorama.items[itemId] ?? {
      marker: { x: 0.5, y: 0.5 },
      focusRect: defaultFocusRect(),
    }
    const viewport = current.viewportOverride ?? { centerX: 0.5, centerY: 0.5, zoom: 1 }
    return {
      ...panorama,
      items: { ...panorama.items, [itemId]: { ...current, viewportOverride: mutator(viewport) } },
    }
  })
}

// ─── shared bits ────────────────────────────────────────

function TextFieldPlain({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}): JSX.Element {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <Stack gap="1">
      <Text fontSize="12px" color="ink.muted" fontWeight="500">
        {label}
      </Text>
      <Input
        value={local}
        onChange={e => {
          setLocal(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        size="sm"
        bg="bg.raised"
      />
    </Stack>
  )
}

function NumberFieldPlain({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
}): JSX.Element {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <Stack gap="1">
      <Text fontSize="12px" color="ink.muted" fontWeight="500">
        {label}
      </Text>
      <Box position="relative" w="100%">
        <input
          type="number"
          value={Number.isFinite(local) ? local : ''}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const n = e.target.value === '' ? 0 : Number(e.target.value)
            if (!Number.isNaN(n)) {
              setLocal(n)
              onChange(n)
            }
          }}
          style={{
            width: '100%',
            height: 32,
            padding: '0 10px',
            background: 'var(--ig-colors-paper-raised)',
            border: '1px solid var(--ig-colors-rule)',
            borderRadius: 4,
            fontSize: 13,
            color: 'var(--ig-colors-ink)',
            outline: 'none',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      </Box>
    </Stack>
  )
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
}): JSX.Element {
  return (
    <Stack gap="1">
      <Text fontSize="12px" color="ink.muted" fontWeight="500">
        {label}
      </Text>
      <NativeSelect.Root size="sm">
        <NativeSelect.Field
          value={value}
          onChange={e => onChange(e.target.value)}
          bg="bg.raised"
          borderColor="border"
          fontSize="13px"
          color="ink"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Stack>
  )
}

function ChakraToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <HStack justify="space-between" align="center" py="1">
      <Text fontSize="12px" color="ink">
        {label}
      </Text>
      <Switch.Root
        checked={checked}
        onCheckedChange={() => onToggle()}
        colorPalette="brand"
        size="sm"
      >
        <Switch.HiddenInput />
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Root>
    </HStack>
  )
}

function SectionHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string
  title?: string
  actions?: React.ReactNode
}): JSX.Element {
  return (
    <Box
      borderBottomWidth="1px"
      borderColor="border"
      py="3"
      px="4"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap="3"
    >
      <Stack gap="0.5" minW="0">
        {eyebrow && <Text className="eyebrow">{eyebrow}</Text>}
        {title && (
          <Text fontSize="15px" fontWeight="600" color="ink">
            {title}
          </Text>
        )}
      </Stack>
      {actions && <HStack gap="1.5">{actions}</HStack>}
    </Box>
  )
}

function FieldGroup({
  icon: IconComp,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <Box py="3" px="4" borderBottomWidth="1px" borderColor="border">
      <HStack align="center" gap="1.5" mb="2.5">
        <IconComp size={12} color="ink.faint" />
        <Text className="eyebrow" fontSize="10px" color="ink.faint">
          {title}
        </Text>
      </HStack>
      <Stack gap="2">{children}</Stack>
    </Box>
  )
}

function patchExperience(
  knowledge: GuideProject['knowledge'],
  categoryId: string,
  kind: 'panorama' | 'html-scene',
  sceneIdOverride?: string,
  viewIdOverride?: string,
): GuideProject['knowledge'] {
  const stages = knowledge.stages as unknown as IndustryStage[]
  return {
    ...knowledge,
    stages: stages.map(s => ({
      ...s,
      categories: s.categories.map(c => {
        if (c.id !== categoryId) return c
        if (kind === 'panorama') {
          return { ...c, experience: { kind: 'panorama' } }
        }
        const current = c.experience
        const nextSceneId =
          sceneIdOverride ?? (current.kind === 'html-scene' ? current.sceneId : '')
        const nextViewId = viewIdOverride ?? (current.kind === 'html-scene' ? current.viewId : '')
        return {
          ...c,
          experience: { kind: 'html-scene', sceneId: nextSceneId, viewId: nextViewId },
        }
      }),
    })),
  } as GuideProject['knowledge']
}
