/**
 * CatalogEditor — orchestrator for the catalog product.
 *
 * Layout (mirrors AtlasEditor but stage-centric):
 *   - Top: stage tab bar (上游 / 中游 / 下游)
 *   - Left: category list of the active stage
 *   - Center: category preview (industry items rendered as cards)
 *   - Right: inspector (category metadata + items table)
 *   - Bottom: toolbar with Save / theme
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type {
  GuideProject,
  IndustryStage,
  IndustryCategory,
  IndustryItem,
  CatalogProductConfig,
  PanoramaModel,
} from '@domain/project-types'
import {
  Alert,
  Box,
  Flex,
  Grid,
  Text,
} from '@chakra-ui/react'
import {
  useProject,
  useUpdateCatalogConfig,
  useUpdateKnowledge,
  useUpdatePanorama,
} from '../api'
import { useCatalogEditorStore } from '../store'
import { CatalogCanvas } from './CatalogCanvas'
import { CatalogInspector } from './CatalogInspector'
import { CatalogAuthoringCanvas } from './CatalogAuthoringCanvas'
import { CatalogEditorCanvas } from './CatalogEditorCanvas'
import { CatalogToolbar } from './CatalogToolbar'
import { ApiError } from '../../../lib/api-client'
import { useGlobalShortcuts } from '../../../hooks/useGlobalShortcuts'

interface Props {
  projectId: string
}

let _idCounter = 0
function nextId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`
}

export function CatalogEditor({ projectId }: Props): JSX.Element {
  const projectQuery = useProject(projectId)
  const updateKnowledge = useUpdateKnowledge(projectId)
  const updateCatalogConfig = useUpdateCatalogConfig(projectId)
  const updatePanorama = useUpdatePanorama(projectId)

  const [draft, setDraft] = useState<GuideProject | null>(null)
  const [pendingConfig, setPendingConfig] = useState<boolean>(false)
  const [pendingKnowledge, setPendingKnowledge] = useState<boolean>(false)
  const [pendingPanorama, setPendingPanorama] = useState<boolean>(false)
  const [canvasMode, setCanvasMode] = useState<'editor' | 'preview'>('editor')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (projectQuery.data) {
      setDraft(projectQuery.data)
      setPendingConfig(false)
      setPendingKnowledge(false)
      setPendingPanorama(false)
    }
  }, [projectQuery.data])

  const selection = useCatalogEditorStore((s) => s.selection)
  const setSelection = useCatalogEditorStore((s) => s.setSelection)
  const selectedStage = useCatalogEditorStore((s) => s.selectedStage)
  const setSelectedStage = useCatalogEditorStore((s) => s.setSelectedStage)
  const setDirty = useCatalogEditorStore((s) => s.setDirty)
  const reset = useCatalogEditorStore((s) => s.reset)

  useEffect(() => {
    reset()
  }, [projectId, reset])

  const handlePatchCatalogConfig = useCallback(
    (mutator: (cfg: CatalogProductConfig) => CatalogProductConfig) => {
      setDraft((prev) =>
        prev
          ? { ...prev, products: { ...prev.products, catalog: mutator(prev.products.catalog) } }
          : prev,
      )
      setPendingConfig(true)
      setDirty(true)
    },
    [setDirty],
  )

  const handlePatchKnowledge = useCallback(
    (mutator: (k: GuideProject['knowledge']) => GuideProject['knowledge']) => {
      setDraft((prev) => (prev ? { ...prev, knowledge: mutator(prev.knowledge) } : prev))
      setPendingKnowledge(true)
      setDirty(true)
    },
    [setDirty],
  )

  const handlePatchPanorama = useCallback(
    (mutator: (panorama: PanoramaModel) => PanoramaModel) => {
      setDraft(prev => (prev ? { ...prev, panorama: mutator(prev.panorama) } : prev))
      setPendingPanorama(true)
      setDirty(true)
    },
    [setDirty],
  )

  const handleSave = async () => {
    if (!draft) return
    setSaveError(null)
    try {
      let current = draft
      if (pendingKnowledge) {
        current = await updateKnowledge.mutateAsync({
          knowledge: current.knowledge,
          expectedRevision: current.metadata.revision,
        })
        setPendingKnowledge(false)
      }
      if (pendingPanorama) {
        current = await updatePanorama.mutateAsync({
          panorama: current.panorama,
          expectedRevision: current.metadata.revision,
        })
        setPendingPanorama(false)
      }
      if (pendingConfig) {
        current = await updateCatalogConfig.mutateAsync({
          catalog: current.products.catalog,
          expectedRevision: current.metadata.revision,
        })
        setPendingConfig(false)
      }
      setDraft(current)
      if (pendingKnowledge || pendingPanorama || pendingConfig) {
        setDirty(false)
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          setSaveError('保存冲突：当前项目已被另一处修改，请刷新后重试。')
        } else {
          setSaveError(`保存失败：${e.status} ${e.code}`)
        }
      } else {
        setSaveError((e as Error).message || '保存失败')
      }
    }
  }

  useGlobalShortcuts({
    shortcuts: [
      { key: 's', meta: true, description: 'Save', run: () => void handleSave() },
      { key: 'Escape', bare: true, description: 'Clear selection', run: () => setSelection(null) },
    ],
  })

  if (projectQuery.isLoading || !draft) {
    return (
      <Flex align="center" justify="center" h="100%">
        <Text>加载项目中…</Text>
      </Flex>
    )
  }

  if (projectQuery.isError) {
    return (
      <Box p="6">
        <Text color="state.error">加载失败</Text>
        <Text fontSize="12px" color="ink.muted">
          {(projectQuery.error as Error).message}
        </Text>
      </Box>
    )
  }

  const stagesArr = draft.knowledge.stages as unknown as IndustryStage[]
  const activeStage = stagesArr.find((s) => s.key === selectedStage) ?? stagesArr[0]
  const isSaving = updateCatalogConfig.isPending || updateKnowledge.isPending || updatePanorama.isPending

  /** Keep the authoring selection aligned with the runtime: a stage or category
   * always opens on its first available tertiary item. */
  const selectCategory = (categoryId: string) => {
    const category = stagesArr.flatMap(stage => stage.categories).find(c => c.id === categoryId)
    const firstItemId = category?.itemIds.find(id => Boolean(draft.knowledge.items[id]))
    setSelection(firstItemId ? { kind: 'item', id: firstItemId } : { kind: 'category', id: categoryId })
  }
  const selectStage = (stageKey: IndustryStage['key']) => {
    setSelectedStage(stageKey)
    const category = stagesArr.find(stage => stage.key === stageKey)?.categories[0]
    if (category) selectCategory(category.id)
    else setSelection(null)
  }

  return (
    <Flex direction="column" h="100%" bg="bg">
      <CatalogToolbar
        onSave={() => void handleSave()}
        isSaving={isSaving}
        isDirty={pendingKnowledge || pendingPanorama || pendingConfig}
        hasUnsavedKnowledge={pendingKnowledge}
        hasUnsavedPanorama={pendingPanorama}
        hasUnsavedConfig={pendingConfig}
      />

      {saveError && (
        <Alert.Root
          status="error"
          size="sm"
          borderRadius="0"
          borderLeftWidth="0"
          borderRightWidth="0"
          data-testid="save-error"
        >
          <Alert.Indicator>
            <AlertTriangle size={14} />
          </Alert.Indicator>
          <Alert.Title fontSize="12px">{saveError}</Alert.Title>
        </Alert.Root>
      )}

      <Grid templateColumns="260px 1fr 320px" flex="1" minH="0" overflow="hidden">
        <CatalogCanvas
          project={draft}
          activeStage={activeStage}
          selection={selection}
          onSelectStage={selectStage}
          onSelect={(next) => {
            if (next?.kind === 'category') selectCategory(next.id)
            else setSelection(next)
          }}
          onAddCategory={() => {
            handlePatchKnowledge((k) => {
              const id = nextId('cat')
              const newCat: IndustryCategory = {
                id,
                title: '新分类',
                order: activeStage.categories.length + 1,
                itemIds: [],
                experience: { kind: 'panorama' },
              }
              return {
                ...k,
                stages: stagesArr.map((s) =>
                  s.key === activeStage.key
                    ? { ...s, categories: [...s.categories, newCat] }
                    : s,
                ),
              } as GuideProject['knowledge']
            })
          }}
          onRenameCategory={(categoryId, title) => {
            handlePatchKnowledge((k) => ({
              ...k,
              stages: stagesArr.map((s) => ({
                ...s,
                categories: s.categories.map((c) =>
                  c.id === categoryId ? { ...c, title } : c,
                ),
              })),
            }) as GuideProject['knowledge'])
          }}
          onDeleteCategory={(categoryId) => {
            const itemIds = stagesArr
              .flatMap(stage => stage.categories)
              .find(category => category.id === categoryId)?.itemIds ?? []
            handlePatchKnowledge((k) => ({
              ...k,
              stages: stagesArr.map((s) => ({
                ...s,
                categories: s.categories.filter((c) => c.id !== categoryId),
              })),
              items: Object.fromEntries(
                Object.entries(k.items).filter(
                  ([, item]) => item.categoryId !== categoryId,
                ),
              ),
            }) as GuideProject['knowledge'])
            handlePatchPanorama(panorama => {
              const { [categoryId]: _category, ...categories } = panorama.categories
              const items = Object.fromEntries(
                Object.entries(panorama.items).filter(([itemId]) => !itemIds.includes(itemId)),
              )
              return { ...panorama, categories, items }
            })
            if (selection?.kind === 'category' && selection.id === categoryId) {
              setSelection(null)
            }
          }}
          onAddItem={(categoryId) => {
            const id = nextId('item')
            handlePatchKnowledge((k) => {
              const cat = stagesArr.flatMap((s) => s.categories).find((c) => c.id === categoryId)
              const item: IndustryItem = {
                id,
                categoryId,
                title: '新项目',
                description: '',
                order: (cat?.itemIds.length ?? 0) + 1,
              }
              return {
                ...k,
                items: { ...k.items, [id]: item },
                stages: stagesArr.map((s) => ({
                  ...s,
                  categories: s.categories.map((c) =>
                    c.id === categoryId ? { ...c, itemIds: [...c.itemIds, id] } : c,
                  ),
                })),
              } as GuideProject['knowledge']
            })
            handlePatchPanorama(panorama => ({
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
          }}
          onDeleteItem={(itemId) => {
            handlePatchKnowledge((k) => {
              const item = k.items[itemId]
              if (!item) return k
              const { [itemId]: _r, ...rest } = k.items
              return {
                ...k,
                items: rest,
                stages: stagesArr.map((s) => ({
                  ...s,
                  categories: s.categories.map((c) =>
                    c.id === item.categoryId
                      ? { ...c, itemIds: c.itemIds.filter((i) => i !== itemId) }
                      : c,
                  ),
                })),
              } as GuideProject['knowledge']
            })
            handlePatchPanorama(panorama => {
              const { [itemId]: _item, ...items } = panorama.items
              return { ...panorama, items }
            })
            if (selection?.kind === 'item' && selection.id === itemId) {
              setSelection(null)
            }
          }}
        />

        <Box bg="bg.sunken" overflow="hidden" minW="0" position="relative">
          <Box position="absolute" top="3" right="3" zIndex="3" display="flex" gap="1" bg="rgba(15,23,42,.84)" p="1" borderRadius="md">
            <button type="button" onClick={() => setCanvasMode('editor')} data-testid="catalog-canvas-mode-editor" style={canvasModeButtonStyle(canvasMode === 'editor')}>编辑</button>
            <button type="button" onClick={() => setCanvasMode('preview')} data-testid="catalog-canvas-mode-preview" style={canvasModeButtonStyle(canvasMode === 'preview')}>运行时预览</button>
          </Box>
          {canvasMode === 'editor' ? (
            <CatalogAuthoringCanvas
              project={draft}
              selectedStage={selectedStage}
              selection={selection}
              onSelect={setSelection}
              onPatchPanorama={handlePatchPanorama}
            />
          ) : (
            <CatalogEditorCanvas
              project={draft}
              selectedStage={selectedStage}
              selection={selection}
              onSelectStage={selectStage}
              onSelect={setSelection}
              onPatchPanorama={handlePatchPanorama}
              mode="preview"
            />
          )}
        </Box>

        <CatalogInspector
          project={draft}
          selection={selection}
          activeStage={activeStage}
          onPatchCatalogConfig={handlePatchCatalogConfig}
          onPatchKnowledge={handlePatchKnowledge}
          onPatchPanorama={handlePatchPanorama}
          onSaveRequested={() => void handleSave()}
          hasUnsavedConfig={pendingConfig}
          isSaving={isSaving}
        />
      </Grid>
    </Flex>
  )
}

function canvasModeButtonStyle(active: boolean): React.CSSProperties {
  return { border: '0', borderRadius: 4, padding: '5px 8px', fontSize: 12, cursor: 'pointer', color: active ? '#0f172a' : '#cbd5e1', background: active ? '#f8fafc' : 'transparent' }
}
