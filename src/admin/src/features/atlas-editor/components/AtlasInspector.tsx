/**
 * AtlasInspector — right-rail properties pane.
 *
 * Renders an editable form for whichever object is currently selected:
 *   - AtlasConfigForm  when no selection (default to project-wide config)
 *   - Category hotspot / viewport fields when a category is selected
 *   - Item marker / callout fields when an item is selected
 *
 * All edits flow through the parent's onPatchPanorama / onPatchAtlasConfig
 * callbacks. Each field is controlled by react-hook-form so that dirty
 * values are tracked and committed only on Save.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box as IconBox,
  Compass,
  FileText,
  MapPin,
  MessageSquare,
  MousePointer2,
  Settings2,
  Sliders,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  GuideProject,
  AtlasProductConfig,
  CategorySpatialLayout,
  ItemSpatialLayout,
  ItemCallout,
  CategoryExperienceBinding,
  ExperienceNavigation,
  AssetDefinition,
} from '@domain/project-types'
import {
  Box,
  Button,
  EmptyState,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import {
  CalloutFormSchema,
  HotspotFormSchema,
  ViewportFormSchema,
  type CalloutForm,
  type HotspotForm,
  type ViewportForm,
} from '../schema'
import type { Selection } from '../store'
import { localized, updateLocalized } from '../../projects/localization'

type Mode = 'config' | 'category' | 'item'

interface Props {
  project: GuideProject
  selection: Selection
  onPatchAtlasConfig: (mutator: (cfg: AtlasProductConfig) => AtlasProductConfig) => void
  onPatchPanorama: (mutator: (p: GuideProject['panorama']) => GuideProject['panorama']) => void
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchNavigation: (
    mutator: (n: GuideProject['navigation']) => GuideProject['navigation'],
  ) => void
  hasUnsavedConfig: boolean
  hasUnsavedPanorama: boolean
  hasUnsavedKnowledge: boolean
  hasUnsavedNavigation: boolean
  onSaveRequested: () => void
  isSaving: boolean
  locale: string
}

export function AtlasInspector({
  project,
  selection,
  onPatchAtlasConfig,
  onPatchPanorama,
  onPatchKnowledge,
  onPatchNavigation,
  hasUnsavedConfig,
  hasUnsavedPanorama,
  hasUnsavedKnowledge,
  hasUnsavedNavigation,
  onSaveRequested,
  isSaving,
  locale,
}: Props): JSX.Element {
  const mode: Mode = useMemo(() => {
    if (selection?.kind === 'category') return 'category'
    if (selection?.kind === 'item') return 'item'
    return 'config'
  }, [selection])

  return (
    <Box
      as="aside"
      data-testid="atlas-inspector"
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
        <AtlasConfigInspector
          project={project}
          onPatch={onPatchAtlasConfig}
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
          onPatchPanorama={onPatchPanorama}
          onPatchKnowledge={onPatchKnowledge}
          onPatchNavigation={onPatchNavigation}
          hasUnsaved={hasUnsavedPanorama || hasUnsavedKnowledge || hasUnsavedNavigation}
          onSaveRequested={onSaveRequested}
          isSaving={isSaving}
          locale={locale}
        />
      )}
      {mode === 'item' && selection?.kind === 'item' && (
        <ItemInspector
          project={project}
          itemId={selection.id}
          onPatchPanorama={onPatchPanorama}
          onPatchKnowledge={onPatchKnowledge}
          hasUnsaved={hasUnsavedPanorama || hasUnsavedKnowledge}
          onSaveRequested={onSaveRequested}
          isSaving={isSaving}
          locale={locale}
        />
      )}
    </Box>
  )
}

// ─── Atlas Config Inspector ────────────────────────────────

interface AtlasConfigInspectorProps {
  project: GuideProject
  onPatch: (mutator: (cfg: AtlasProductConfig) => AtlasProductConfig) => void
  hasUnsaved: boolean
  onSaveRequested: () => void
  isSaving: boolean
  locale: string
}

function AtlasConfigInspector({
  project,
  onPatch,
  hasUnsaved,
  onSaveRequested,
  isSaving,
  locale,
}: AtlasConfigInspectorProps): JSX.Element {
  const cfg = project.products.atlas
  const subscribe = (mutator: (cfg: AtlasProductConfig) => AtlasProductConfig) => {
    onPatch(mutator)
  }

  return (
    <>
      <SectionHeader
        eyebrow="Project-wide"
        title="Atlas 配置"
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
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
              顶部提示语
            </Field.Label>
            <Input
              value={localized(cfg.hintText, locale)}
              onChange={e =>
                subscribe(c => ({
                  ...c,
                  hintText: updateLocalized(c.hintText, locale, e.target.value),
                }))
              }
              placeholder="例如：拖动平移，滚轮缩放"
              size="sm"
              bg="bg.raised"
            />
            <Field.HelperText fontSize="11px" color="ink.faint">
              出现在全景图上方的提示文本
            </Field.HelperText>
          </Field.Root>
        </FieldGroup>

        <FieldGroup icon={MapPin} title="Hotspot 样式">
          <LabeledSelect
            label="样式"
            value={cfg.theme.hotspotVariant}
            options={[
              { value: 'default', label: '默认（实心圆）' },
              { value: 'highlight', label: '高亮（描边圆）' },
              { value: 'minimal', label: '极简（小圆点）' },
            ]}
            onChange={v =>
              subscribe(c => ({
                ...c,
                theme: { ...c.theme, hotspotVariant: v as typeof c.theme.hotspotVariant },
              }))
            }
          />
          <LabeledSelect
            label="Callout 形式"
            value={cfg.theme.calloutVariant}
            options={[
              { value: 'classic', label: '经典胶囊' },
              { value: 'connector', label: '连接式（预留）' },
              { value: 'none', label: '无' },
            ]}
            onChange={v =>
              subscribe(c => ({
                ...c,
                theme: { ...c.theme, calloutVariant: v as typeof c.theme.calloutVariant },
              }))
            }
          />
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="Hotspot 显示阈值"
                value={cfg.theme.hotspotMinZoom ?? 1}
                min={1}
                max={4}
                step={0.1}
                onChange={v =>
                  subscribe(c => ({
                    ...c,
                    theme: { ...c.theme, hotspotMinZoom: v },
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="Callout 显示阈值"
                value={cfg.theme.calloutMinZoom ?? 2}
                min={1}
                max={4}
                step={0.1}
                onChange={v =>
                  subscribe(c => ({
                    ...c,
                    theme: { ...c.theme, calloutMinZoom: v },
                  }))
                }
              />
            </Box>
          </HStack>
        </FieldGroup>

        <FieldGroup icon={Sliders} title="视口与交互">
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="宽度"
                value={cfg.viewport.width}
                min={240}
                max={2400}
                onChange={v =>
                  subscribe(c => ({
                    ...c,
                    viewport: { ...c.viewport, width: v },
                  }))
                }
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="高度"
                value={cfg.viewport.height}
                min={320}
                max={4000}
                onChange={v =>
                  subscribe(c => ({
                    ...c,
                    viewport: { ...c.viewport, height: v },
                  }))
                }
              />
            </Box>
          </HStack>
          <ChakraToggleRow
            label="滚轮缩放"
            checked={cfg.interaction.wheelZoom}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                interaction: { ...c.interaction, wheelZoom: !c.interaction.wheelZoom },
              }))
            }
          />
          <ChakraToggleRow
            label="拖拽平移"
            checked={cfg.interaction.dragPan}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                interaction: { ...c.interaction, dragPan: !c.interaction.dragPan },
              }))
            }
          />
          <ChakraToggleRow
            label="双指缩放"
            checked={cfg.interaction.pinchZoom}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                interaction: { ...c.interaction, pinchZoom: !c.interaction.pinchZoom },
              }))
            }
          />
          <ChakraToggleRow
            label="重置视角按钮"
            checked={cfg.interaction.resetCameraEnabled}
            onToggle={() =>
              subscribe(c => ({
                ...c,
                interaction: {
                  ...c.interaction,
                  resetCameraEnabled: !c.interaction.resetCameraEnabled,
                },
              }))
            }
          />
        </FieldGroup>

        <FieldGroup icon={Settings2} title="Chrome">
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

// ─── Category Inspector ────────────────────────────────────

interface CategoryInspectorProps {
  project: GuideProject
  categoryId: string
  onPatchPanorama: (mutator: (p: GuideProject['panorama']) => GuideProject['panorama']) => void
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchNavigation: (
    mutator: (n: GuideProject['navigation']) => GuideProject['navigation'],
  ) => void
  hasUnsaved: boolean
  onSaveRequested: () => void
  isSaving: boolean
  locale: string
}

function CategoryInspector({
  project,
  categoryId,
  onPatchPanorama,
  onPatchKnowledge,
  onPatchNavigation,
  hasUnsaved,
  onSaveRequested,
  isSaving,
  locale,
}: CategoryInspectorProps): JSX.Element {
  const category = project.knowledge.stages
    .flatMap(s => s.categories)
    .find(c => c.id === categoryId)
  const layout: CategorySpatialLayout | undefined = project.panorama.categories[categoryId]

  if (!category) {
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

  const hotspotForm = useForm<HotspotForm>({
    defaultValues: {
      enabled: Boolean(layout?.hotspot),
      x: layout?.hotspot?.x ?? 0.5,
      y: layout?.hotspot?.y ?? 0.5,
    },
    resolver: zodResolver(HotspotFormSchema),
  })

  const viewportForm = useForm<ViewportForm>({
    defaultValues: {
      centerX: layout?.viewport.centerX ?? 0.5,
      centerY: layout?.viewport.centerY ?? 0.5,
      zoom: layout?.viewport.zoom ?? 2,
    },
    resolver: zodResolver(ViewportFormSchema),
  })

  useEffect(() => {
    hotspotForm.reset({
      enabled: Boolean(layout?.hotspot),
      x: layout?.hotspot?.x ?? 0.5,
      y: layout?.hotspot?.y ?? 0.5,
    })
    viewportForm.reset({
      centerX: layout?.viewport.centerX ?? 0.5,
      centerY: layout?.viewport.centerY ?? 0.5,
      zoom: layout?.viewport.zoom ?? 2,
    })
  }, [categoryId, project.metadata.revision])

  const patchLayout = (mutator: (l: CategorySpatialLayout) => CategorySpatialLayout) => {
    onPatchPanorama(p => ({
      ...p,
      categories: {
        ...p.categories,
        [categoryId]: mutator(p.categories[categoryId] ?? makeDefaultLayout()),
      },
    }))
  }

  return (
    <>
      <SectionHeader
        eyebrow="Category"
        title={localized(category.title, locale)}
        actions={
          hasUnsaved ? (
            <Button
              variant="brand"
              size="sm"
              onClick={onSaveRequested}
              loading={isSaving}
              data-testid="btn-save-category"
            >
              保存
            </Button>
          ) : null
        }
      />
      <Box px="4" pb="2">
        <Text fontFamily="mono" fontSize="11px" color="ink.faint">
          {category.id}
        </Text>
      </Box>
      <Stack flex="1" overflow="auto" gap="0">
        <FieldGroup icon={IconBox} title="体验形式">
          <ExperienceForm
            category={category}
            project={project}
            locale={locale}
            onPatch={onPatchKnowledge}
            onPatchNavigation={onPatchNavigation}
          />
        </FieldGroup>

        <FieldGroup icon={MapPin} title="Hotspot">
          <ChakraToggleRow
            label="启用 Hotspot"
            checked={Boolean(layout?.hotspot)}
            onToggle={() => {
              const enabled = !Boolean(layout?.hotspot)
              hotspotForm.setValue('enabled', enabled)
              if (!enabled) {
                patchLayout(l => ({ ...l, hotspot: undefined }))
              } else {
                patchLayout(l => ({
                  ...l,
                  hotspot: l.hotspot ?? { x: 0.5, y: 0.5 },
                }))
              }
            }}
          />
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="x"
                value={hotspotForm.watch('x')}
                min={0}
                max={1}
                step={0.01}
                onChange={v => {
                  hotspotForm.setValue('x', v)
                  patchLayout(l => ({ ...l, hotspot: { x: v, y: l.hotspot?.y ?? 0.5 } }))
                }}
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="y"
                value={hotspotForm.watch('y')}
                min={0}
                max={1}
                step={0.01}
                onChange={v => {
                  hotspotForm.setValue('y', v)
                  patchLayout(l => ({ ...l, hotspot: { x: l.hotspot?.x ?? 0.5, y: v } }))
                }}
              />
            </Box>
          </HStack>
        </FieldGroup>

        <FieldGroup icon={Compass} title="激活视口">
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="cx"
                value={viewportForm.watch('centerX')}
                min={0}
                max={1}
                step={0.01}
                onChange={v => {
                  viewportForm.setValue('centerX', v)
                  patchLayout(l => ({
                    ...l,
                    viewport: { ...l.viewport, centerX: v },
                  }))
                }}
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="cy"
                value={viewportForm.watch('centerY')}
                min={0}
                max={1}
                step={0.01}
                onChange={v => {
                  viewportForm.setValue('centerY', v)
                  patchLayout(l => ({
                    ...l,
                    viewport: { ...l.viewport, centerY: v },
                  }))
                }}
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="zoom"
                value={viewportForm.watch('zoom')}
                min={1}
                max={4}
                step={0.1}
                onChange={v => {
                  viewportForm.setValue('zoom', v)
                  patchLayout(l => ({
                    ...l,
                    viewport: { ...l.viewport, zoom: v },
                  }))
                }}
              />
            </Box>
          </HStack>
          <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
            zoom 是分类默认视口；点击 hotspot 聚焦首个三级节点时，使用该节点实际生效的 Callout
            显示阈值。
          </Text>
        </FieldGroup>
      </Stack>
    </>
  )
}

function ExperienceForm({
  category,
  project,
  locale,
  onPatch,
  onPatchNavigation,
}: {
  category: { id: string; experience: CategoryExperienceBinding }
  project: GuideProject
  locale: string
  onPatch: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  onPatchNavigation: (
    mutator: (n: GuideProject['navigation']) => GuideProject['navigation'],
  ) => void
}): JSX.Element {
  const exp = category.experience
  const [kind, setKind] = useState<'panorama' | 'html-scene'>(exp.kind)
  const [sceneId, setSceneId] = useState<string>(exp.kind === 'html-scene' ? exp.sceneId : '')
  const [viewId, setViewId] = useState<string>(exp.kind === 'html-scene' ? exp.viewId : '')
  const route = useMemo(
    () => findCategorySceneRoute(project.navigation, category.id),
    [project.navigation, category.id],
  )
  const transition = route?.transition
  const videoAssets = useMemo(
    () =>
      Object.values(project.assets.byId)
        .filter((asset): asset is AssetDefinition => asset.kind === 'video')
        .sort((a, b) => a.id.localeCompare(b.id)),
    [project.assets.byId],
  )

  useEffect(() => {
    setKind(category.experience.kind)
    setSceneId(category.experience.kind === 'html-scene' ? category.experience.sceneId : '')
    setViewId(category.experience.kind === 'html-scene' ? category.experience.viewId : '')
  }, [category.id, category.experience])

  return (
    <Stack gap="2">
      <LabeledSelect
        label="类型"
        value={kind}
        options={[
          { value: 'panorama', label: 'Panorama 全景（默认）' },
          { value: 'html-scene', label: 'HTML Scene' },
        ]}
        onChange={v => {
          const nextKind = v as 'panorama' | 'html-scene'
          setKind(nextKind)
          onPatch(k => patchCategoryExperience(k, category.id, nextKind))
          if (nextKind === 'panorama') {
            onPatchNavigation(navigation => removeCategorySceneRoute(navigation, category.id))
          }
        }}
      />
      {kind === 'html-scene' && (
        <>
          <LabeledSelect
            label="场景"
            value={sceneId}
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
            onChange={v => {
              setSceneId(v)
              onPatch(k => patchCategoryExperience(k, category.id, 'html-scene', v, undefined))
              onPatchNavigation(navigation =>
                syncCategorySceneRoute(navigation, category.id, v, viewId),
              )
            }}
          />
          <LabeledSelect
            label="视图"
            value={viewId}
            options={(() => {
              const scene = project.scenes.find(s => s.id === sceneId)
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
            onChange={v => {
              setViewId(v)
              onPatch(k => patchCategoryExperience(k, category.id, 'html-scene', undefined, v))
              onPatchNavigation(navigation =>
                syncCategorySceneRoute(navigation, category.id, sceneId, v),
              )
            }}
          />
          {sceneId && viewId && (
            <>
              <ChakraToggleRow
                label="启用过渡视频"
                checked={Boolean(transition)}
                onToggle={() => {
                  onPatchNavigation(navigation =>
                    patchCategorySceneRouteTransition(
                      navigation,
                      category.id,
                      sceneId,
                      viewId,
                      transition
                        ? undefined
                        : {
                            kind: 'video',
                            assetId: videoAssets[0]?.id ?? '',
                            timeoutMs: 8000,
                            onFailure: 'cut',
                          },
                    ),
                  )
                }}
              />
              {transition && (
                <>
                  <LabeledSelect
                    label="过渡视频"
                    value={transition.assetId}
                    options={
                      videoAssets.length === 0
                        ? [{ value: '', label: '（暂无视频资源，先去 Settings 上传）' }]
                        : videoAssets.map(asset => ({ value: asset.id, label: asset.id }))
                    }
                    onChange={assetId => {
                      onPatchNavigation(navigation =>
                        patchCategorySceneRouteTransition(
                          navigation,
                          category.id,
                          sceneId,
                          viewId,
                          {
                            ...transition,
                            assetId,
                          },
                        ),
                      )
                    }}
                  />
                  <NumberFieldPlain
                    label="转场超时 (ms)"
                    value={transition.timeoutMs ?? 8000}
                    min={500}
                    max={30000}
                    step={100}
                    onChange={value => {
                      onPatchNavigation(navigation =>
                        patchCategorySceneRouteTransition(
                          navigation,
                          category.id,
                          sceneId,
                          viewId,
                          {
                            ...transition,
                            timeoutMs: Math.max(500, Math.round(value)),
                          },
                        ),
                      )
                    }}
                  />
                  <LabeledSelect
                    label="失败策略"
                    value={transition.onFailure}
                    options={[
                      { value: 'cut', label: 'cut：视频失败则中止进入' },
                      { value: 'abort-navigation', label: 'abort-navigation：失败则直接进入' },
                    ]}
                    onChange={value => {
                      onPatchNavigation(navigation =>
                        patchCategorySceneRouteTransition(
                          navigation,
                          category.id,
                          sceneId,
                          viewId,
                          {
                            ...transition,
                            onFailure: value as 'cut' | 'abort-navigation',
                          },
                        ),
                      )
                    }}
                  />
                </>
              )}
            </>
          )}
          <Text fontSize="11px" color="ink.faint" lineHeight="1.5">
            HTML 场景需先在 Settings → HTML 场景 上传 zip 包并创建视图。绑定 scene/view 后，Atlas
            会为该分类生成一条 panorama → scene 的 route；若启用过渡视频，则点击 hotspot
            会先播视频再进入 scene。
          </Text>
        </>
      )}
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

// ─── Item Inspector ─────────────────────────────────────────

interface ItemInspectorProps {
  project: GuideProject
  itemId: string
  onPatchPanorama: (mutator: (p: GuideProject['panorama']) => GuideProject['panorama']) => void
  onPatchKnowledge: (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => void
  hasUnsaved: boolean
  onSaveRequested: () => void
  isSaving: boolean
  locale: string
}

function ItemInspector({
  project,
  itemId,
  onPatchPanorama,
  onPatchKnowledge,
  hasUnsaved,
  onSaveRequested,
  isSaving,
  locale,
}: ItemInspectorProps): JSX.Element {
  const item = project.knowledge.items[itemId]
  const layout: ItemSpatialLayout | undefined = project.panorama.items[itemId]

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

  const calloutForm = useForm<CalloutForm>({
    defaultValues: {
      enabled: Boolean(layout?.callout),
      markerPosition: layout?.callout?.markerPosition ?? 'top',
      markerGapPx: layout?.callout?.markerGapPx ?? 6,
    },
    resolver: zodResolver(CalloutFormSchema),
  })

  useEffect(() => {
    calloutForm.reset({
      enabled: Boolean(layout?.callout),
      markerPosition: layout?.callout?.markerPosition ?? 'top',
      markerGapPx: layout?.callout?.markerGapPx ?? 6,
    })
  }, [itemId, project.metadata.revision])

  const patchLayout = (mutator: (l: ItemSpatialLayout) => ItemSpatialLayout) => {
    onPatchPanorama(p => ({
      ...p,
      items: {
        ...p.items,
        [itemId]: mutator(p.items[itemId] ?? makeDefaultItemLayout()),
      },
    }))
  }

  const patchItem = (mutator: (current: typeof item) => typeof item) => {
    onPatchKnowledge(knowledge => ({
      ...knowledge,
      items: {
        ...knowledge.items,
        [itemId]: mutator(knowledge.items[itemId] ?? item),
      },
    }))
  }

  return (
    <>
      <SectionHeader
        eyebrow="Item"
        title={localized(item.title, locale)}
        actions={
          hasUnsaved ? (
            <Button
              variant="brand"
              size="sm"
              onClick={onSaveRequested}
              loading={isSaving}
              data-testid="btn-save-item"
            >
              保存
            </Button>
          ) : null
        }
      />
      <Box px="4" pb="2">
        <Text fontFamily="mono" fontSize="11px" color="ink.faint">
          {item.id}
        </Text>
      </Box>
      <Stack flex="1" overflow="auto" gap="0">
        <FieldGroup icon={FileText} title="内容">
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              标题
            </Field.Label>
            <Input
              value={localized(item.title, locale)}
              size="sm"
              bg="bg.raised"
              onChange={event =>
                patchItem(current => ({
                  ...current,
                  title: updateLocalized(current.title, locale, event.target.value),
                }))
              }
              data-testid="atlas-item-title"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              内容说明
            </Field.Label>
            <textarea
              value={localized(item.description, locale)}
              rows={4}
              onChange={event =>
                patchItem(current => ({
                  ...current,
                  description: updateLocalized(current.description, locale, event.target.value),
                }))
              }
              data-testid="atlas-item-description"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: '6px',
                background: 'var(--chakra-colors-bg-raised)',
                color: 'var(--chakra-colors-ink)',
                fontSize: '13px',
                lineHeight: '1.5',
                padding: '8px',
              }}
            />
          </Field.Root>
          <NumberFieldPlain
            label="排序"
            value={item.order}
            min={0}
            max={9999}
            step={1}
            onChange={value => patchItem(current => ({ ...current, order: Math.round(value) }))}
          />
        </FieldGroup>

        <FieldGroup icon={MapPin} title="Marker">
          <HStack gap="2" align="flex-start">
            <Box flex="1">
              <NumberFieldPlain
                label="x"
                value={layout?.marker.x ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v => patchLayout(l => ({ ...l, marker: { x: v, y: l.marker.y } }))}
              />
            </Box>
            <Box flex="1">
              <NumberFieldPlain
                label="y"
                value={layout?.marker.y ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                onChange={v => patchLayout(l => ({ ...l, marker: { x: l.marker.x, y: v } }))}
              />
            </Box>
          </HStack>
        </FieldGroup>

        <FieldGroup icon={MessageSquare} title="Callout">
          <ChakraToggleRow
            label="启用 Callout"
            checked={Boolean(layout?.callout)}
            onToggle={() => {
              const enabled = !Boolean(layout?.callout)
              calloutForm.setValue('enabled', enabled)
              if (!enabled) {
                patchLayout(l => ({ ...l, callout: undefined }))
              } else {
                const callout: ItemCallout = {
                  markerPosition: layout?.callout?.markerPosition ?? 'top',
                  markerGapPx: layout?.callout?.markerGapPx ?? 6,
                }
                patchLayout(l => ({ ...l, callout }))
              }
            }}
          />
          <LabeledSelect
            label="Marker 位置"
            value={calloutForm.watch('markerPosition')}
            options={[
              { value: 'top', label: '在上方' },
              { value: 'bottom', label: '在下方' },
            ]}
            onChange={v => {
              calloutForm.setValue('markerPosition', v as ItemCallout['markerPosition'])
              patchLayout(l => ({
                ...l,
                callout: {
                  markerPosition: v as ItemCallout['markerPosition'],
                  markerGapPx: l.callout?.markerGapPx ?? 6,
                },
              }))
            }}
          />
          <NumberFieldPlain
            label="Marker 与胶囊间距 (px)"
            value={calloutForm.watch('markerGapPx')}
            min={0}
            max={64}
            step={1}
            onChange={v => {
              const next = Math.round(v)
              calloutForm.setValue('markerGapPx', next)
              patchLayout(l => ({
                ...l,
                callout: {
                  markerPosition: l.callout?.markerPosition ?? 'top',
                  markerGapPx: next,
                },
              }))
            }}
          />
          <NumberFieldPlain
            label="Callout 显示阈值"
            value={layout?.callout?.minZoom ?? 2}
            min={1}
            max={4}
            step={0.1}
            onChange={v => {
              patchLayout(l => ({
                ...l,
                callout: l.callout
                  ? {
                      markerPosition: l.callout.markerPosition,
                      markerGapPx: l.callout.markerGapPx,
                      minZoom: v,
                    }
                  : {
                      markerPosition: 'top',
                      markerGapPx: 6,
                      minZoom: v,
                    },
              }))
            }}
          />
        </FieldGroup>
      </Stack>
    </>
  )
}

// ─── shared bits ────────────────────────────────────────────

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

function makeDefaultLayout(): CategorySpatialLayout {
  return {
    viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 },
  }
}

function makeDefaultItemLayout(): ItemSpatialLayout {
  return {
    marker: { x: 0.5, y: 0.5 },
  }
}

function patchCategoryExperience(
  knowledge: GuideProject['knowledge'],
  categoryId: string,
  kind: 'panorama' | 'html-scene',
  sceneIdOverride?: string,
  viewIdOverride?: string,
): GuideProject['knowledge'] {
  const stages = knowledge.stages as unknown as Array<{
    categories: Array<{
      id: string
      experience: CategoryExperienceBinding
    }>
  }>
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

function categorySceneRouteId(categoryId: string): string {
  return `route-panorama-category-${categoryId}-to-scene`
}

function findCategorySceneRoute(
  navigation: ExperienceNavigation,
  categoryId: string,
): ExperienceNavigation['routes'][number] | undefined {
  return navigation.routes.find(route => route.id === categorySceneRouteId(categoryId))
}

function syncCategorySceneRoute(
  navigation: ExperienceNavigation,
  categoryId: string,
  sceneId: string,
  viewId: string,
): ExperienceNavigation {
  if (!sceneId || !viewId) {
    return removeCategorySceneRoute(navigation, categoryId)
  }
  const routeId = categorySceneRouteId(categoryId)
  const existing = findCategorySceneRoute(navigation, categoryId)
  const nextRoute = {
    id: routeId,
    from: { kind: 'panorama', categoryId } as const,
    to: { kind: 'scene', sceneId, viewId } as const,
    ...(existing?.transition ? { transition: existing.transition } : {}),
  }
  return {
    routes: [...navigation.routes.filter(route => route.id !== routeId), nextRoute],
  }
}

function removeCategorySceneRoute(
  navigation: ExperienceNavigation,
  categoryId: string,
): ExperienceNavigation {
  const routeId = categorySceneRouteId(categoryId)
  return {
    routes: navigation.routes.filter(route => route.id !== routeId),
  }
}

function patchCategorySceneRouteTransition(
  navigation: ExperienceNavigation,
  categoryId: string,
  sceneId: string,
  viewId: string,
  transition:
    | {
        kind: 'video'
        assetId: string
        timeoutMs?: number
        onFailure: 'cut' | 'abort-navigation'
      }
    | undefined,
): ExperienceNavigation {
  if (!sceneId || !viewId) return navigation
  const routeId = categorySceneRouteId(categoryId)
  const base = syncCategorySceneRoute(navigation, categoryId, sceneId, viewId)
  return {
    routes: base.routes.map(route =>
      route.id === routeId
        ? {
            ...route,
            ...(transition && transition.assetId ? { transition } : {}),
            ...(transition && !transition.assetId ? { transition: undefined } : {}),
          }
        : route,
    ),
  }
}
