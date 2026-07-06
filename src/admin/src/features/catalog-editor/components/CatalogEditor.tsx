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
} from '../api'
import { useCatalogEditorStore } from '../store'
import { CatalogStageTabs } from './CatalogStageTabs'
import { CatalogCanvas } from './CatalogCanvas'
import { CatalogInspector } from './CatalogInspector'
import { CatalogPreview } from './CatalogPreview'
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

  const [draft, setDraft] = useState<GuideProject | null>(null)
  const [pendingConfig, setPendingConfig] = useState<boolean>(false)
  const [pendingKnowledge, setPendingKnowledge] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (projectQuery.data) {
      setDraft(projectQuery.data)
      setPendingConfig(false)
      setPendingKnowledge(false)
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

  const handleSave = async () => {
    if (!draft) return
    setSaveError(null)
    const rev = draft.metadata.revision
    try {
      if (pendingKnowledge) {
        await updateKnowledge.mutateAsync({
          knowledge: draft.knowledge,
          expectedRevision: rev,
        })
        setPendingKnowledge(false)
      }
      if (pendingConfig) {
        await updateCatalogConfig.mutateAsync({
          catalog: draft.products.catalog,
          expectedRevision: rev,
        })
        setPendingConfig(false)
      }
      if (pendingKnowledge || pendingConfig) {
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
  const isSaving = updateCatalogConfig.isPending || updateKnowledge.isPending

  return (
    <Flex direction="column" h="100%" bg="bg">
      <CatalogStageTabs
        stages={stagesArr}
        activeStageKey={selectedStage}
        onChange={setSelectedStage}
        stats={stagesArr.map((s) => ({
          key: s.key,
          count: s.categories.length,
        }))}
      />

      <CatalogToolbar
        onSave={() => void handleSave()}
        isSaving={isSaving}
        isDirty={pendingKnowledge || pendingConfig}
        hasUnsavedKnowledge={pendingKnowledge}
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
          onSelect={setSelection}
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
            if (selection?.kind === 'item' && selection.id === itemId) {
              setSelection(null)
            }
          }}
        />

        <Box bg="bg.sunken" overflow="hidden" minW="0">
          <CatalogPreview project={draft} />
        </Box>

        <CatalogInspector
          project={draft}
          selection={selection}
          activeStage={activeStage}
          onPatchCatalogConfig={handlePatchCatalogConfig}
          onPatchKnowledge={handlePatchKnowledge}
          onSaveRequested={() => void handleSave()}
          hasUnsavedConfig={pendingConfig}
          isSaving={isSaving}
        />
      </Grid>
    </Flex>
  )
}
