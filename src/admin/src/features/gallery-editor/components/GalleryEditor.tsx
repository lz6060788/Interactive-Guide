import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Flex, Grid, Text } from '@chakra-ui/react'
import { AlertTriangle } from 'lucide-react'
import type {
  AtlasProductConfig,
  ExperienceLocation,
  ExperienceNavigation,
  GalleryProductConfig,
  GuideProject,
  HtmlScenePackage,
  IndustryCategory,
  IndustryItem,
  IndustryStageKey,
  PanoramaModel,
} from '@domain/project-types'
import { setLocalizedText } from '@domain/localization'
import { ApiError } from '../../../lib/api-client'
import { useGlobalShortcuts } from '../../../hooks/useGlobalShortcuts'
import { ContentLocaleSwitcher } from '../../projects/ContentLocaleSwitcher'
import { effectiveContentLocale, useContentLocaleStore } from '../../projects/localization'
import { useUploadAsset } from '../../projects/api'
import { useProductExport } from '../../product-export/useProductExport'
import {
  useGalleryProject,
  useUpdateGalleryAtlasConfig,
  useUpdateGalleryConfig,
  useUpdateGalleryKnowledge,
  useUpdateGalleryNavigation,
  useUpdateGalleryPanorama,
  useUpdateGalleryScenes,
} from '../api'
import type { GalleryEditorSelection } from '../types'
import { GalleryInspector } from './GalleryInspector'
import { GalleryPreviewCanvas } from './GalleryPreviewCanvas'
import { GalleryStructurePanel } from './GalleryStructurePanel'
import { GalleryToolbar } from './GalleryToolbar'

interface GalleryEditorProps {
  projectId: string
  onStateChange?: (state: { dirty: boolean; revision: number }) => void
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export function GalleryEditor({ projectId, onStateChange }: GalleryEditorProps): JSX.Element {
  const projectQuery = useGalleryProject(projectId)
  const updateGallery = useUpdateGalleryConfig(projectId)
  const updateKnowledge = useUpdateGalleryKnowledge(projectId)
  const updatePanorama = useUpdateGalleryPanorama(projectId)
  const updateAtlas = useUpdateGalleryAtlasConfig(projectId)
  const updateNavigation = useUpdateGalleryNavigation(projectId)
  const updateScenes = useUpdateGalleryScenes(projectId)
  const uploadAsset = useUploadAsset(projectId)
  const requestedLocale = useContentLocaleStore(state => state.locale)
  const setRequestedLocale = useContentLocaleStore(state => state.setLocale)

  const [draft, setDraft] = useState<GuideProject | null>(null)
  const draftRef = useRef<GuideProject | null>(null)
  const [selection, setSelection] = useState<GalleryEditorSelection>(null)
  const [activeStageKey, setActiveStageKey] = useState<IndustryStageKey>('upstream')
  const [galleryDirty, setGalleryDirty] = useState(false)
  const [knowledgeDirty, setKnowledgeDirty] = useState(false)
  const [panoramaDirty, setPanoramaDirty] = useState(false)
  const [atlasDirty, setAtlasDirty] = useState(false)
  const [navigationDirty, setNavigationDirty] = useState(false)
  const [scenesDirty, setScenesDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hydrated = useRef<string | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!projectQuery.data || hydrated.current === projectId) return
    const project = projectQuery.data
    const initial = firstItemLocation(project)
    setDraft(project)
    draftRef.current = project
    setSelection(initial ? { kind: 'item', id: initial.itemId } : null)
    setActiveStageKey(initial?.stageKey ?? project.knowledge.stages[0].key)
    setGalleryDirty(false)
    setKnowledgeDirty(false)
    setPanoramaDirty(false)
    setAtlasDirty(false)
    setNavigationDirty(false)
    setScenesDirty(false)
    hydrated.current = projectId
  }, [projectId, projectQuery.data])

  const dirty =
    galleryDirty || knowledgeDirty || panoramaDirty || atlasDirty || navigationDirty || scenesDirty
  useEffect(() => {
    if (draft) onStateChange?.({ dirty, revision: draft.metadata.revision })
  }, [dirty, draft, onStateChange])

  const patchGallery = useCallback(
    (mutator: (config: GalleryProductConfig) => GalleryProductConfig) => {
      setDraft(current => {
        if (!current) return current
        const next = {
          ...current,
          products: { ...current.products, gallery: mutator(current.products.gallery) },
        }
        draftRef.current = next
        return next
      })
      setGalleryDirty(true)
    },
    [],
  )

  const patchKnowledge = useCallback(
    (mutator: (knowledge: GuideProject['knowledge']) => GuideProject['knowledge']) => {
      setDraft(current => {
        if (!current) return current
        const next = { ...current, knowledge: mutator(current.knowledge) }
        draftRef.current = next
        return next
      })
      setKnowledgeDirty(true)
    },
    [],
  )

  const patchPanorama = useCallback((mutator: (panorama: PanoramaModel) => PanoramaModel) => {
    setDraft(current => {
      if (!current) return current
      const next = { ...current, panorama: mutator(current.panorama) }
      draftRef.current = next
      return next
    })
    setPanoramaDirty(true)
  }, [])

  const patchAtlas = useCallback((mutator: (atlas: AtlasProductConfig) => AtlasProductConfig) => {
    setDraft(current => {
      if (!current) return current
      const next = {
        ...current,
        products: { ...current.products, atlas: mutator(current.products.atlas) },
      }
      draftRef.current = next
      return next
    })
    setAtlasDirty(true)
  }, [])

  const patchNavigation = useCallback(
    (mutator: (navigation: ExperienceNavigation) => ExperienceNavigation) => {
      setDraft(current => {
        if (!current) return current
        const next = { ...current, navigation: mutator(current.navigation) }
        draftRef.current = next
        return next
      })
      setNavigationDirty(true)
    },
    [],
  )

  const patchScenes = useCallback((mutator: (scenes: HtmlScenePackage[]) => HtmlScenePackage[]) => {
    setDraft(current => {
      if (!current) return current
      const next = { ...current, scenes: mutator(current.scenes) }
      draftRef.current = next
      return next
    })
    setScenesDirty(true)
  }, [])

  const patchCategory = useCallback(
    (categoryId: string, mutator: (category: IndustryCategory) => IndustryCategory) => {
      patchKnowledge(knowledge => ({
        ...knowledge,
        stages: knowledge.stages.map(stage => ({
          ...stage,
          categories: stage.categories.map(category =>
            category.id === categoryId ? mutator(category) : category,
          ),
        })) as GuideProject['knowledge']['stages'],
      }))
    },
    [patchKnowledge],
  )

  const patchItem = useCallback(
    (itemId: string, mutator: (item: IndustryItem) => IndustryItem) => {
      patchKnowledge(knowledge => {
        const item = knowledge.items[itemId]
        if (!item) return knowledge
        return { ...knowledge, items: { ...knowledge.items, [itemId]: mutator(item) } }
      })
    },
    [patchKnowledge],
  )

  const save = useCallback(async (): Promise<GuideProject> => {
    const currentDraft = draftRef.current
    if (!currentDraft) throw new Error('项目尚未加载')
    setError(null)
    let current = currentDraft
    try {
      if (knowledgeDirty) {
        const saved = await updateKnowledge.mutateAsync({
          knowledge: current.knowledge,
          expectedRevision: current.metadata.revision,
        })
        current = { ...current, knowledge: saved.knowledge, metadata: saved.metadata }
        setKnowledgeDirty(false)
      }
      if (panoramaDirty) {
        const saved = await updatePanorama.mutateAsync({
          panorama: current.panorama,
          expectedRevision: current.metadata.revision,
        })
        current = { ...current, panorama: saved.panorama, metadata: saved.metadata }
        setPanoramaDirty(false)
      }
      if (atlasDirty) {
        const saved = await updateAtlas.mutateAsync({
          atlas: current.products.atlas,
          expectedRevision: current.metadata.revision,
        })
        current = {
          ...current,
          products: { ...current.products, atlas: saved.products.atlas },
          metadata: saved.metadata,
        }
        setAtlasDirty(false)
      }
      if (navigationDirty) {
        const saved = await updateNavigation.mutateAsync({
          navigation: current.navigation,
          expectedRevision: current.metadata.revision,
        })
        current = { ...current, navigation: saved.navigation, metadata: saved.metadata }
        setNavigationDirty(false)
      }
      if (scenesDirty) {
        const saved = await updateScenes.mutateAsync({
          scenes: current.scenes,
          expectedRevision: current.metadata.revision,
        })
        current = { ...current, scenes: saved.scenes, metadata: saved.metadata }
        setScenesDirty(false)
      }
      if (galleryDirty) {
        const saved = await updateGallery.mutateAsync({
          gallery: current.products.gallery,
          expectedRevision: current.metadata.revision,
        })
        current = {
          ...current,
          products: { ...current.products, gallery: saved.products.gallery },
          metadata: saved.metadata,
        }
        setGalleryDirty(false)
      }
      setDraft(current)
      draftRef.current = current
      return current
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.status === 409
          ? '保存冲突：项目已在其他位置更新，请刷新后重试。'
          : cause instanceof Error
            ? cause.message
            : String(cause)
      setError(message)
      throw cause
    }
  }, [
    atlasDirty,
    galleryDirty,
    knowledgeDirty,
    navigationDirty,
    panoramaDirty,
    scenesDirty,
    updateAtlas,
    updateGallery,
    updateKnowledge,
    updateNavigation,
    updatePanorama,
    updateScenes,
  ])

  const productExport = useProductExport({
    projectId,
    product: 'gallery',
    currentRevision: draft?.metadata.revision ?? -1,
    isDirty: dirty,
    save,
  })

  useGlobalShortcuts({
    shortcuts: [
      {
        key: 's',
        meta: true,
        description: 'Save',
        run: () => void save().catch(() => undefined),
      },
      { key: 'Escape', bare: true, description: 'Clear selection', run: () => setSelection(null) },
    ],
  })

  const handlePreviewSelect = useCallback((itemId: string) => {
    const current = draftRef.current
    if (!current?.knowledge.items[itemId]) return
    const stage = stageForItem(current, itemId)
    if (stage) setActiveStageKey(stage.key)
    setSelection({ kind: 'item', id: itemId })
  }, [])

  if (projectQuery.isError) {
    return (
      <Flex h="100%" align="center" justify="center" direction="column" gap="2">
        <Text color="state.error" fontWeight="600">
          Gallery 项目加载失败
        </Text>
        <Text fontSize="12px" color="ink.muted">
          {(projectQuery.error as Error).message}
        </Text>
      </Flex>
    )
  }

  if (projectQuery.isLoading || !draft) {
    return (
      <Flex h="100%" align="center" justify="center">
        <Text color="ink.muted">加载 Gallery 工作台…</Text>
      </Flex>
    )
  }

  const locale = effectiveContentLocale(draft, requestedLocale)
  const activeStage =
    draft.knowledge.stages.find(stage => stage.key === activeStageKey) ?? draft.knowledge.stages[0]
  const itemIds = draft.knowledge.stages.flatMap(stage =>
    stage.categories.flatMap(category => category.itemIds),
  )
  const boundCount = itemIds.filter(itemId => {
    const assetId = draft.products.gallery.itemImageAssetIds[itemId]
    return Boolean(assetId && draft.assets.byId[assetId]?.kind === 'image')
  }).length
  const selectedItemId = itemIdForSelection(draft, selection) ?? ''
  const isSaving =
    updateGallery.isPending ||
    updateKnowledge.isPending ||
    updatePanorama.isPending ||
    updateAtlas.isPending ||
    updateNavigation.isPending ||
    updateScenes.isPending

  const selectStage = (stageKey: IndustryStageKey) => {
    setActiveStageKey(stageKey)
    const stage = draft.knowledge.stages.find(candidate => candidate.key === stageKey)
    const category = stage?.categories[0]
    const itemId = category?.itemIds.find(id => Boolean(draft.knowledge.items[id]))
    setSelection(
      itemId
        ? { kind: 'item', id: itemId }
        : category
          ? { kind: 'category', id: category.id }
          : null,
    )
  }

  const addCategory = () => {
    const id = nextId('cat')
    patchKnowledge(knowledge => ({
      ...knowledge,
      stages: knowledge.stages.map(stage =>
        stage.key === activeStage.key
          ? {
              ...stage,
              categories: [
                ...stage.categories,
                {
                  id,
                  title: setLocalizedText(undefined, locale, '新二级节点'),
                  description: setLocalizedText(undefined, locale, ''),
                  order: Math.max(0, ...stage.categories.map(category => category.order)) + 1,
                  itemIds: [],
                  experience: { kind: 'panorama' as const },
                },
              ],
            }
          : stage,
      ) as GuideProject['knowledge']['stages'],
    }))
    setSelection({ kind: 'category', id })
  }

  const deleteCategory = (categoryId: string) => {
    const category = draft.knowledge.stages
      .flatMap(stage => stage.categories)
      .find(candidate => candidate.id === categoryId)
    if (!category) return
    const removedCategoryIds = new Set([categoryId])
    const removedItemIds = new Set(category.itemIds)
    patchKnowledge(knowledge => ({
      ...knowledge,
      stages: knowledge.stages.map(stage => ({
        ...stage,
        categories: stage.categories.filter(candidate => candidate.id !== categoryId),
      })) as GuideProject['knowledge']['stages'],
      items: Object.fromEntries(
        Object.entries(knowledge.items).filter(([itemId]) => !removedItemIds.has(itemId)),
      ),
    }))
    patchPanorama(panorama => {
      const { [categoryId]: _category, ...categories } = panorama.categories
      return {
        ...panorama,
        categories,
        items: Object.fromEntries(
          Object.entries(panorama.items).filter(([itemId]) => !removedItemIds.has(itemId)),
        ),
      }
    })
    patchGallery(config => ({
      ...config,
      itemImageAssetIds: Object.fromEntries(
        Object.entries(config.itemImageAssetIds).filter(([itemId]) => !removedItemIds.has(itemId)),
      ),
    }))
    patchAtlas(atlas => ({
      ...atlas,
      categoryIds: atlas.categoryIds.filter(candidate => candidate !== categoryId),
    }))
    patchNavigation(navigation => ({
      ...navigation,
      routes: navigation.routes.filter(
        route =>
          !locationReferencesRemovedNodes(route.from, removedCategoryIds, removedItemIds) &&
          !locationReferencesRemovedNodes(route.to, removedCategoryIds, removedItemIds),
      ),
    }))
    patchScenes(scenes => removeSceneReferences(scenes, removedCategoryIds, removedItemIds))
    const fallback = firstSelectionExcluding(draft, removedCategoryIds, removedItemIds)
    setSelection(fallback)
    const fallbackStage = stageForSelection(draft, fallback)
    if (fallbackStage) setActiveStageKey(fallbackStage.key)
  }

  const addItem = (categoryId: string) => {
    const id = nextId('item')
    patchKnowledge(knowledge => ({
      ...knowledge,
      stages: knowledge.stages.map(stage => ({
        ...stage,
        categories: stage.categories.map(category =>
          category.id === categoryId
            ? { ...category, itemIds: [...category.itemIds, id] }
            : category,
        ),
      })) as GuideProject['knowledge']['stages'],
      items: {
        ...knowledge.items,
        [id]: {
          id,
          categoryId,
          title: setLocalizedText(undefined, locale, '新三级节点'),
          description: setLocalizedText(undefined, locale, ''),
          order:
            Math.max(
              0,
              ...Object.values(knowledge.items)
                .filter(item => item.categoryId === categoryId)
                .map(item => item.order),
            ) + 1,
        },
      },
    }))
    patchPanorama(panorama => ({
      ...panorama,
      items: {
        ...panorama.items,
        [id]: {
          marker: { x: 0.5, y: 0.5 },
          focusRect: { x: 0.35, y: 0.35, width: 0.2, height: 0.2 },
        },
      },
    }))
    setSelection({ kind: 'item', id })
  }

  const deleteItem = (itemId: string) => {
    patchKnowledge(knowledge => {
      const { [itemId]: _item, ...items } = knowledge.items
      return {
        ...knowledge,
        items,
        stages: knowledge.stages.map(stage => ({
          ...stage,
          categories: stage.categories.map(category => ({
            ...category,
            itemIds: category.itemIds.filter(candidate => candidate !== itemId),
          })),
        })) as GuideProject['knowledge']['stages'],
      }
    })
    patchPanorama(panorama => {
      const { [itemId]: _item, ...items } = panorama.items
      return { ...panorama, items }
    })
    patchGallery(config => {
      const { [itemId]: _assetId, ...itemImageAssetIds } = config.itemImageAssetIds
      return { ...config, itemImageAssetIds }
    })
    const removedItemIds = new Set([itemId])
    patchNavigation(navigation => ({
      ...navigation,
      routes: navigation.routes.filter(
        route =>
          !locationReferencesRemovedNodes(route.from, new Set(), removedItemIds) &&
          !locationReferencesRemovedNodes(route.to, new Set(), removedItemIds),
      ),
    }))
    patchScenes(scenes => removeSceneReferences(scenes, new Set(), removedItemIds))
    const fallback = firstSelectionExcluding(draft, new Set(), removedItemIds)
    setSelection(fallback)
    const fallbackStage = stageForSelection(draft, fallback)
    if (fallbackStage) setActiveStageKey(fallbackStage.key)
  }

  const uploadItemImage = async (itemId: string, file: File): Promise<void> => {
    const current = draftRef.current
    if (!current) return
    setError(null)
    try {
      const assetId = `gallery-${safeId(itemId)}-${Date.now().toString(36)}`
      await uploadAsset.mutateAsync({
        kind: 'image',
        assetId,
        expectedRevision: current.metadata.revision,
        file,
      })
      const refreshed = await projectQuery.refetch()
      if (!refreshed.data) throw new Error('图片已上传，但项目刷新失败')
      const local = draftRef.current ?? current
      const next: GuideProject = {
        ...refreshed.data,
        knowledge: local.knowledge,
        panorama: local.panorama,
        scenes: local.scenes,
        navigation: local.navigation,
        products: {
          ...refreshed.data.products,
          atlas: local.products.atlas,
          gallery: {
            ...local.products.gallery,
            itemImageAssetIds: {
              ...local.products.gallery.itemImageAssetIds,
              [itemId]: assetId,
            },
          },
        },
      }
      setDraft(next)
      draftRef.current = next
      setGalleryDirty(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Flex direction="column" h="100%" bg="bg" color="ink">
      <Flex
        minH="9"
        px="2"
        align="center"
        justify="flex-end"
        flexShrink="0"
        bg="bg.raised"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <ContentLocaleSwitcher
          locale={locale}
          supportedLocales={draft.localization.supportedLocales}
          onChange={setRequestedLocale}
        />
      </Flex>
      <GalleryToolbar
        boundCount={boundCount}
        itemCount={itemIds.length}
        enabled={draft.products.gallery.enabled}
        isDirty={dirty}
        isSaving={isSaving}
        exportOperation={productExport.operation}
        onEnabledChange={enabled => patchGallery(config => ({ ...config, enabled }))}
        onPreview={() => void productExport.generatePreview()}
        onDownload={() => void productExport.downloadZip()}
        onSave={() => void save().catch(() => undefined)}
      />

      {(error || productExport.error) && (
        <Alert.Root
          status="error"
          size="sm"
          borderRadius="0"
          borderLeftWidth="0"
          borderRightWidth="0"
        >
          <Alert.Indicator>
            <AlertTriangle size={14} />
          </Alert.Indicator>
          <Alert.Title>{error ?? productExport.error}</Alert.Title>
        </Alert.Root>
      )}

      <Grid templateColumns="280px minmax(420px, 1fr) 320px" flex="1" minH="0" overflow="hidden">
        <GalleryStructurePanel
          project={draft}
          activeStage={activeStage}
          selection={selection}
          locale={locale}
          isSaving={isSaving}
          onSelectStage={selectStage}
          onSelect={setSelection}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
          onAddItem={addItem}
          onDeleteItem={deleteItem}
        />

        <GalleryPreviewCanvas
          project={draft}
          selectedItemId={selectedItemId}
          locale={locale}
          onSelectItem={handlePreviewSelect}
        />

        <GalleryInspector
          project={draft}
          selection={selection}
          locale={locale}
          isUploading={uploadAsset.isPending}
          onPatchGallery={patchGallery}
          onPatchCategory={patchCategory}
          onPatchItem={patchItem}
          onUploadItemImage={(itemId, file) => void uploadItemImage(itemId, file)}
        />
      </Grid>
    </Flex>
  )
}

function firstItemLocation(
  project: GuideProject,
): { stageKey: IndustryStageKey; itemId: string } | undefined {
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      const itemId = category.itemIds.find(id => Boolean(project.knowledge.items[id]))
      if (itemId) return { stageKey: stage.key, itemId }
    }
  }
  return undefined
}

function itemIdForSelection(
  project: GuideProject,
  selection: GalleryEditorSelection,
): string | undefined {
  if (selection?.kind === 'item' && project.knowledge.items[selection.id]) return selection.id
  if (selection?.kind === 'category') {
    const category = project.knowledge.stages
      .flatMap(stage => stage.categories)
      .find(candidate => candidate.id === selection.id)
    return category?.itemIds.find(itemId => Boolean(project.knowledge.items[itemId]))
  }
  return undefined
}

function stageForItem(project: GuideProject, itemId: string) {
  return project.knowledge.stages.find(stage =>
    stage.categories.some(category => category.itemIds.includes(itemId)),
  )
}

function stageForSelection(project: GuideProject, selection: GalleryEditorSelection) {
  if (!selection) return undefined
  if (selection.kind === 'item') return stageForItem(project, selection.id)
  return project.knowledge.stages.find(stage =>
    stage.categories.some(category => category.id === selection.id),
  )
}

function locationReferencesRemovedNodes(
  location: ExperienceLocation,
  categoryIds: Set<string>,
  itemIds: Set<string>,
): boolean {
  return (
    location.kind === 'panorama' &&
    (Boolean(location.categoryId && categoryIds.has(location.categoryId)) ||
      Boolean(location.itemId && itemIds.has(location.itemId)))
  )
}

function removeSceneReferences(
  scenes: HtmlScenePackage[],
  categoryIds: Set<string>,
  itemIds: Set<string>,
): HtmlScenePackage[] {
  return scenes.map(scene => ({
    ...scene,
    views: scene.views.map(view => ({
      ...view,
      categoryIds: view.categoryIds.filter(categoryId => !categoryIds.has(categoryId)),
      ...(view.itemFocusMap
        ? {
            itemFocusMap: Object.fromEntries(
              Object.entries(view.itemFocusMap).filter(([itemId]) => !itemIds.has(itemId)),
            ),
          }
        : {}),
    })),
  }))
}

function firstSelectionExcluding(
  project: GuideProject,
  excludedCategoryIds: Set<string>,
  excludedItemIds: Set<string>,
): GalleryEditorSelection {
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      if (excludedCategoryIds.has(category.id)) continue
      const itemId = category.itemIds.find(
        candidate => !excludedItemIds.has(candidate) && Boolean(project.knowledge.items[candidate]),
      )
      if (itemId) return { kind: 'item', id: itemId }
      return { kind: 'category', id: category.id }
    }
  }
  return null
}

function safeId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  )
}
