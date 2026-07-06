/**
 * AtlasEditor — orchestrator component.
 *
 * Wires together:
 *   - StructurePanel      (left rail)
 *   - AtlasToolbar        (canvas + preview mode bar)
 *   - AtlasCanvas         (panorama with hotspots)
 *   - AtlasPreview        (runtime live preview)
 *   - AtlasInspector      (right rail with RHF forms)
 *
 * Holds the in-flight draft of panorama + atlas config so the editor
 * feels instantaneous. Mutations are committed on Save (one PUT per
 * logical sub-section) so network chatter is bounded.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type {
  GuideProject,
  IndustryStage,
  PanoramaModel,
  AtlasProductConfig,
  IndustryChain,
} from '@domain/project-types'
import { Alert, Box, Flex, Grid, HStack, Text } from '@chakra-ui/react'
import {
  useProject,
  useUpdateAtlasConfig,
  useUpdateKnowledge,
  useUpdatePanorama,
} from '../api'
import { useAtlasEditorStore } from '../store'
import { StructurePanel } from './StructurePanel'
import { AtlasToolbar, type Tool } from './AtlasToolbar'
import { AtlasCanvas } from './AtlasCanvas'
import { AtlasPreview } from './AtlasPreview'
import { AtlasInspector } from './AtlasInspector'
import { ApiError } from '../../../lib/api-client'
import { useGlobalShortcuts } from '../../../hooks/useGlobalShortcuts'

let _idCounter = 0
function nextId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`
}

interface Props {
  projectId: string
}

export function AtlasEditor({ projectId }: Props): JSX.Element {
  const projectQuery = useProject(projectId)
  const updatePanorama = useUpdatePanorama(projectId)
  const updateKnowledge = useUpdateKnowledge(projectId)
  const updateAtlasConfig = useUpdateAtlasConfig(projectId)

  const serverProject = projectQuery.data

  const [draft, setDraft] = useState<GuideProject | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingPanorama, setPendingPanorama] = useState<boolean>(false)
  const [pendingConfig, setPendingConfig] = useState<boolean>(false)
  const [pendingKnowledge, setPendingKnowledge] = useState<boolean>(false)

  useEffect(() => {
    if (serverProject) {
      setDraft(serverProject)
      setPendingPanorama(false)
      setPendingConfig(false)
      setPendingKnowledge(false)
    }
  }, [serverProject])

  const tool = useAtlasEditorStore((s) => s.tool)
  const setTool = useAtlasEditorStore((s) => s.setTool)
  const selection = useAtlasEditorStore((s) => s.selection)
  const setSelection = useAtlasEditorStore((s) => s.setSelection)
  const reset = useAtlasEditorStore((s) => s.reset)
  const setDirty = useAtlasEditorStore((s) => s.setDirty)

  useEffect(() => {
    reset()
  }, [projectId, reset])

  const handlePatchPanorama = useCallback(
    (mutator: (p: PanoramaModel) => PanoramaModel) => {
      setDraft((prev) => (prev ? { ...prev, panorama: mutator(prev.panorama) } : prev))
      setPendingPanorama(true)
      setDirty(true)
    },
    [setDirty],
  )

  const handlePatchAtlasConfig = useCallback(
    (mutator: (cfg: AtlasProductConfig) => AtlasProductConfig) => {
      setDraft((prev) =>
        prev ? { ...prev, products: { ...prev.products, atlas: mutator(prev.products.atlas) } } : prev,
      )
      setPendingConfig(true)
      setDirty(true)
    },
    [setDirty],
  )

  const handlePatchKnowledge = useCallback(
    (mutator: (k: IndustryChain) => IndustryChain) => {
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
      if (pendingPanorama) {
        await updatePanorama.mutateAsync({ panorama: draft.panorama, expectedRevision: rev })
        setPendingPanorama(false)
      }
      if (pendingConfig) {
        await updateAtlasConfig.mutateAsync({
          atlas: draft.products.atlas,
          expectedRevision: rev,
        })
        setPendingConfig(false)
      }
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

  const mapStages = (
    stages: IndustryChain['stages'],
    fn: (s: IndustryStage, i: number) => IndustryStage,
  ): IndustryChain['stages'] => {
    const out: IndustryStage[] = [stages[0], stages[1], stages[2]].map(fn)
    return out as unknown as IndustryChain['stages']
  }

  const handleAddCategory = (stageKey: IndustryStage['key']) => {
    const id = nextId('cat')
    handlePatchKnowledge((k) => ({
      ...k,
      stages: mapStages(k.stages, (s) =>
        s.key === stageKey
          ? {
              ...s,
              categories: [
                ...s.categories,
                {
                  id,
                  title: '新分类',
                  order: s.categories.length + 1,
                  itemIds: [],
                  experience: { kind: 'panorama' },
                },
              ],
            }
          : s,
      ),
    }))
    setSelection({ kind: 'category', id })
  }

  const handleRenameCategory = (categoryId: string, title: string) => {
    handlePatchKnowledge((k) => ({
      ...k,
      stages: mapStages(k.stages, (s) => ({
        ...s,
        categories: s.categories.map((c) =>
          c.id === categoryId ? { ...c, title } : c,
        ),
      })),
    }))
  }

  const handleDeleteCategory = (categoryId: string) => {
    handlePatchKnowledge((k) => ({
      ...k,
      stages: mapStages(k.stages, (s) => ({
        ...s,
        categories: s.categories.filter((c) => c.id !== categoryId),
      })),
      items: Object.fromEntries(
        Object.entries(k.items).filter(([, item]) => item.categoryId !== categoryId),
      ),
    }))
    handlePatchPanorama((p) => {
      const { [categoryId]: _removed, ...rest } = p.categories
      return { ...p, categories: rest }
    })
    if (selection?.kind === 'category' && selection.id === categoryId) {
      setSelection(null)
    }
  }

  const handleAddItem = (categoryId: string) => {
    const id = nextId('item')
    handlePatchKnowledge((k) => {
      const cat = k.stages.flatMap((s) => s.categories).find((c) => c.id === categoryId)
      const item = {
        id,
        categoryId,
        title: '新项目',
        description: '',
        order: (cat?.itemIds.length ?? 0) + 1,
      }
      return {
        ...k,
        items: { ...k.items, [id]: item },
        stages: mapStages(k.stages, (s) => ({
          ...s,
          categories: s.categories.map((c) =>
            c.id === categoryId ? { ...c, itemIds: [...c.itemIds, id] } : c,
          ),
        })),
      }
    })
    handlePatchPanorama((p) => ({
      ...p,
      items: {
        ...p.items,
        [id]: {
          marker: { x: 0.5, y: 0.5 },
          focusRect: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
        },
      },
    }))
    setSelection({ kind: 'item', id })
  }

  const handleDeleteItem = (itemId: string) => {
    handlePatchKnowledge((k) => {
      const item = k.items[itemId]
      if (!item) return k
      const { [itemId]: _removed, ...rest } = k.items
      return {
        ...k,
        items: rest,
        stages: mapStages(k.stages, (s) => ({
          ...s,
          categories: s.categories.map((c) =>
            c.id === item.categoryId
              ? { ...c, itemIds: c.itemIds.filter((i) => i !== itemId) }
              : c,
          ),
        })),
      }
    })
    handlePatchPanorama((p) => {
      const { [itemId]: _removed, ...rest } = p.items
      return { ...p, items: rest }
    })
    if (selection?.kind === 'item' && selection.id === itemId) {
      setSelection(null)
    }
  }

  const handleRenameItem = (itemId: string, title: string) => {
    handlePatchKnowledge((k) => ({
      ...k,
      items: {
        ...k.items,
        [itemId]: k.items[itemId]
          ? { ...k.items[itemId], title }
          : k.items[itemId],
      },
    }))
  }

  useGlobalShortcuts({
    shortcuts: [
      { key: 's', meta: true, description: 'Save', run: () => void handleSave() },
      { key: 'v', bare: true, description: 'Select tool', run: () => setTool('select') },
      { key: 'm', bare: true, description: 'Marker tool', run: () => setTool('marker') },
      { key: 'c', bare: true, description: 'Callout tool', run: () => setTool('callout') },
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

  const isSaving = updatePanorama.isPending || updateAtlasConfig.isPending || updateKnowledge.isPending
  const isDirty = pendingPanorama || pendingConfig || pendingKnowledge

  return (
    <Grid templateColumns="260px 1fr 320px" h="100%" bg="bg">
        <StructurePanel
          project={draft}
          selection={selection}
          onSelect={setSelection}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onAddItem={handleAddItem}
          onRenameItem={handleRenameItem}
          onDeleteItem={handleDeleteItem}
          isSaving={isSaving}
        />

      <Flex direction="column" minW="0" overflow="hidden">
        <AtlasToolbar
          tool={tool}
          onToolChange={setTool}
          onSave={() => void handleSave()}
          isSaving={isSaving}
          isDirty={isDirty}
          hasUnsavedPanorama={pendingPanorama}
          hasUnsavedConfig={pendingConfig}
          hasUnsavedKnowledge={pendingKnowledge}
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
        <Grid templateColumns="1fr 360px" flex="1" minH="0">
          <AtlasCanvas
            project={draft}
            tool={tool}
            selection={selection}
            onSelect={setSelection}
            onPatchPanorama={handlePatchPanorama}
            onRenameItem={handleRenameItem}
          />
          <Box borderLeftWidth="1px" borderColor="border" bg="bg.sunken" overflow="hidden">
            <AtlasPreview project={draft} />
          </Box>
        </Grid>
      </Flex>

      <AtlasInspector
        project={draft}
        selection={selection}
        onPatchAtlasConfig={handlePatchAtlasConfig}
        onPatchPanorama={handlePatchPanorama}
        onPatchKnowledge={handlePatchKnowledge}
        hasUnsavedConfig={pendingConfig}
        hasUnsavedPanorama={pendingPanorama}
        hasUnsavedKnowledge={pendingKnowledge}
        onSaveRequested={() => void handleSave()}
        isSaving={isSaving}
      />
    </Grid>
  )
}
