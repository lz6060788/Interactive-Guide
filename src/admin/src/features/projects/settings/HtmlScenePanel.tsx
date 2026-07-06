/**
 * HtmlScenePanel — manage HtmlScenePackage entries for the project.
 *
 * A scene package pairs an uploaded HTML bundle (asset kind =
 * 'html-bundle') with the SceneBridge protocol metadata and a list
 * of views. Each view declares an activation message type and which
 * categories the view covers.
 *
 * Categories in 'html-scene' mode reference (sceneId, viewId) here.
 */
import { useState } from 'react'
import { Box, Plus, Trash2, ExternalLink } from 'lucide-react'
import type {
  GuideProject,
  HtmlScenePackage,
  HtmlSceneView,
  AssetDefinition,
} from '@domain/project-types'
import {
  SCENE_PROTOCOL_CHANNEL,
  SCENE_PROTOCOL_VERSION,
} from '@domain/scene-protocol'
import {
  Alert,
  Badge,
  Box as ChakraBox,
  Button,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { ImeSafeInput } from '../../../components/ImeSafeInput'
import { assetBlobUrl, useDeleteAsset, useUpdateProjectScenes, useUploadAsset } from '../api'

interface Props {
  projectId: string
  revision: number
  project: GuideProject
}

const DEFAULT_ACTIVATION = 'scene.ready'

export function HtmlScenePanel({ projectId, revision, project }: Props): JSX.Element {
  const scenes = project.scenes
  const [error, setError] = useState<string | null>(null)

  const update = useUpdateProjectScenes(projectId)

  const persist = async (next: HtmlScenePackage[]) => {
    setError(null)
    try {
      await update.mutateAsync({ scenes: next, expectedRevision: revision })
    } catch (err) {
      setError((err as Error).message || '保存场景失败')
    }
  }

  const onAddScene = async () => {
    const id = `scene-${Date.now().toString(36)}`
    const next: HtmlScenePackage[] = [
      ...scenes,
      {
        id,
        title: '新 HTML 场景',
        assetId: '',
        protocol: { channel: SCENE_PROTOCOL_CHANNEL, version: SCENE_PROTOCOL_VERSION },
        views: [
          {
            id: 'view-overview',
            title: '概览',
            activationMessage: { type: DEFAULT_ACTIVATION },
            categoryIds: [],
          },
        ],
      },
    ]
    await persist(next)
  }

  return (
    <Stack gap="3">
      <ChakraBox
        data-testid="html-scene-explainer"
        bg="bg.overlay"
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        p="3.5"
      >
        <Stack gap="2">
          <HStack gap="1.5">
            <Text fontSize="11px" className="eyebrow">
              概念
            </Text>
            <Text fontSize="11px" color="ink.muted">
              HTML 场景 vs Panorama 全景
            </Text>
          </HStack>
          <Text fontSize="11.5px" color="ink.muted" lineHeight="1.6">
            Atlas 编辑器里每个分类（category）可以绑定到两种体验形式之一：
            <Text as="span" fontWeight="600" color="ink">Panorama 全景</Text>
            （默认，category 显示为全景图上的 hotspot），
            或者
            <Text as="span" fontWeight="600" color="ink">HTML 场景</Text>
            （category 跳转到独立 HTML 页面）。HTML 场景以 zip 包的形式上传，由 runtime 通过 iframe 加载，通过 SceneBridge 协议通信。
          </Text>
          <ChakraBox
            as="pre"
            className="mono"
            bg="bg.sunken"
            borderWidth="1px"
            borderColor="border"
            borderRadius="sm"
            p="2.5"
            fontSize="11px"
            lineHeight="1.5"
            color="ink.muted"
            whiteSpace="pre"
            overflowX="auto"
          >
{`[ 分类 A ] ─kind: panorama──> 全景图上的 hotspot
                  ↓ 点 hotspot
                  全景图平移到该分类的视口

[ 分类 B ] ─kind: html-scene─> 跳转到独立 HTML 页面
                  ↓ (在右侧 Inspector 选 场景 + 视图)
                  runtime 用 iframe 加载 <bundle>/index.html
                  通过 postMessage(SCENE_PROTOCOL_CHANNEL) 通信`}
          </ChakraBox>
          <Text fontSize="11px" color="ink.faint">
            何时用 HTML 场景：当分类需要展示 3D 模型、动画、可交互 UI（如设备点选、参数滑块），或者用 HTML/CSS 更自然的可视化（如时序图、人物关系图）时。
          </Text>
        </Stack>
      </ChakraBox>

      <HStack align="center" gap="2">
        <Text fontSize="12px" color="ink.muted" flex="1">
          添加新的 HTML 场景后，请在下方场景卡里上传 zip 包。
        </Text>
        <Button
          variant="brand"
          size="sm"
          onClick={() => void onAddScene()}
          loading={update.isPending}
          data-testid="btn-add-scene"
        >
          <HStack gap="1.5">
            <Plus size={14} />
            新增场景
          </HStack>
        </Button>
      </HStack>

      {error && (
        <Alert.Root status="error" size="sm">
          <Alert.Indicator />
          <Alert.Title fontSize="12px">{error}</Alert.Title>
        </Alert.Root>
      )}

      {scenes.length === 0 ? (
        <Text
          fontSize="11px"
          color="ink.faint"
          fontStyle="italic"
          py="3"
          textAlign="center"
        >
          尚未创建任何 HTML 场景。
        </Text>
      ) : (
        <Stack gap="2">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              projectId={projectId}
              revision={revision}
              assets={project.assets.byId}
              allCategories={project.knowledge.stages.flatMap((s) =>
                s.categories.map((c) => ({ id: c.id, title: c.title, stageLabel: s.label })),
              )}
              onChange={async (next) => {
                await persist(scenes.map((s) => (s.id === next.id ? next : s)))
              }}
              onRemove={async () => {
                await persist(scenes.filter((s) => s.id !== scene.id))
              }}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

interface SceneCardProps {
  scene: HtmlScenePackage
  projectId: string
  revision: number
  assets: Record<string, AssetDefinition>
  allCategories: Array<{ id: string; title: string; stageLabel: string }>
  onChange: (next: HtmlScenePackage) => Promise<void>
  onRemove: () => Promise<void>
}

function SceneCard({
  scene,
  projectId,
  revision,
  assets,
  allCategories,
  onChange,
  onRemove,
}: SceneCardProps): JSX.Element {
  const upload = useUploadAsset(projectId)
  const removeAsset = useDeleteAsset(projectId)
  const linkedAsset = scene.assetId ? assets[scene.assetId] : undefined
  const isPending = !scene.assetId || !linkedAsset

  const uploadBundle = async (file: File) => {
    const assetId = scene.assetId?.trim() || `scene-${scene.id}`
    try {
      await upload.mutateAsync({
        kind: 'html-bundle',
        assetId,
        expectedRevision: revision,
        file,
      })
      await onChange({ ...scene, assetId })
    } catch (err) {
      window.alert(`上传失败：${(err as Error).message}`)
    }
  }

  const removeBundle = async () => {
    if (!scene.assetId) return
    if (!window.confirm(`确认删除该 HTML 包（asset: ${scene.assetId}）？`)) return
    try {
      await removeAsset.mutateAsync({
        assetId: scene.assetId,
        expectedRevision: revision,
      })
      await onChange({ ...scene, assetId: '' })
    } catch (err) {
      window.alert(`删除失败：${(err as Error).message}`)
    }
  }

  return (
    <ChakraBox
      data-testid={`scene-${scene.id}`}
      data-pending={isPending ? 'true' : 'false'}
      bg="bg.raised"
      borderWidth="1px"
      borderColor={isPending ? 'state.warn' : 'border'}
      borderRadius="md"
      p="3"
    >
      <Stack gap="2.5">
        {isPending && (
          <ChakraBox
            bg="state.warn.muted"
            borderWidth="1px"
            borderColor="state.warn"
            borderRadius="sm"
            px="2.5"
            py="1.5"
            data-testid={`scene-pending-${scene.id}`}
          >
            <Text fontSize="11px" color="state.warn" fontWeight="600">
              未完成：尚未上传 zip 包，此场景暂时无法在 runtime 中加载。
            </Text>
          </ChakraBox>
        )}
        <HStack align="flex-start" gap="2">
          <ChakraBox color="accent" mt="2">
            <Box size={14} />
          </ChakraBox>
          <Stack gap="1" flex="1">
            <Text fontSize="12px" color="ink.muted" fontWeight="500">
              场景标题
            </Text>
            <ImeSafeInput
              value={scene.title}
              onChange={(v) => void onChange({ ...scene, title: v })}
              size="sm"
              bg="bg.raised"
            />
          </Stack>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`删除场景 ${scene.title}`}
            data-interactive="true"
            onClick={() => void onRemove()}
            className="icon-btn"
            mt="1.5"
          >
            <Trash2 size={12} />
          </IconButton>
        </HStack>

        <Text
          fontSize="11px"
          color="ink.faint"
          fontFamily="mono"
        >
          id: {scene.id} · protocol {scene.protocol.channel}@{scene.protocol.version}
        </Text>

        <Stack
          borderTopWidth="1px"
          borderColor="border"
          borderStyle="dashed"
          pt="2.5"
          gap="2"
        >
          <HStack align="center" gap="1.5">
            <Text fontSize="12px" fontWeight="600" color="ink">
              HTML 包
            </Text>
            {linkedAsset && (
              <Badge
                colorPalette="green"
                variant="subtle"
                size="xs"
                bg="state.ok.muted"
                color="state.ok"
              >
                已上传
              </Badge>
            )}
          </HStack>
          <HStack align="center" gap="1.5">
            <Input
              type="file"
              accept=".zip,application/zip"
              size="xs"
              fontSize="11px"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadBundle(file)
                e.target.value = ''
              }}
            />
            {linkedAsset && (
              <>
                <a
                  href={assetBlobUrl(projectId, linkedAsset.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-interactive="true"
                  className="icon-btn"
                  title="在新窗口打开"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    textDecoration: 'none',
                    color: 'var(--ig-colors-ink-muted)',
                    borderRadius: 3,
                  }}
                >
                  <ExternalLink size={12} />
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeBundle()}
                  data-testid={`btn-remove-bundle-${scene.id}`}
                >
                  <HStack gap="1.5">
                    <Trash2 size={14} />
                    删除包
                  </HStack>
                </Button>
              </>
            )}
          </HStack>
          {linkedAsset ? (
            <Text
              fontFamily="mono"
              fontSize="11px"
              color="ink.muted"
            >
              asset: {linkedAsset.id} · entry: {linkedAsset.entryPath ?? 'index.html'}
            </Text>
          ) : (
            <Text
              fontSize="11px"
              color="ink.faint"
              fontStyle="italic"
            >
              未上传。zip 内必须包含根目录 index.html。
            </Text>
          )}
        </Stack>

        <Stack
          borderTopWidth="1px"
          borderColor="border"
          borderStyle="dashed"
          pt="2.5"
          gap="2"
        >
          <HStack align="center" justify="space-between">
            <Text fontSize="12px" fontWeight="600" color="ink">
              视图（Views）
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void onChange({
                  ...scene,
                  views: [
                    ...scene.views,
                    {
                      id: `view-${Date.now().toString(36)}`,
                      title: '新视图',
                      activationMessage: { type: DEFAULT_ACTIVATION },
                      categoryIds: [],
                    },
                  ],
                })
              }
              data-testid={`btn-add-view-${scene.id}`}
            >
              <HStack gap="1.5">
                <Plus size={14} />
                新增视图
              </HStack>
            </Button>
          </HStack>
          {scene.views.map((view, vi) => (
            <ViewEditor
              key={view.id}
              view={view}
              allCategories={allCategories}
              onChange={(next) =>
                void onChange({
                  ...scene,
                  views: scene.views.map((v, i) => (i === vi ? next : v)),
                })
              }
              onRemove={() =>
                void onChange({
                  ...scene,
                  views: scene.views.filter((_, i) => i !== vi),
                })
              }
            />
          ))}
        </Stack>
      </Stack>
    </ChakraBox>
  )
}

interface ViewEditorProps {
  view: HtmlSceneView
  allCategories: Array<{ id: string; title: string; stageLabel: string }>
  onChange: (next: HtmlSceneView) => void
  onRemove: () => void
}

function ViewEditor({ view, allCategories, onChange, onRemove }: ViewEditorProps): JSX.Element {
  const toggleCategory = (catId: string) => {
    const has = view.categoryIds.includes(catId)
    const next = has
      ? view.categoryIds.filter((id) => id !== catId)
      : [...view.categoryIds, catId]
    onChange({ ...view, categoryIds: next })
  }
  return (
    <ChakraBox
      data-testid={`view-${view.id}`}
      bg="bg.overlay"
      borderWidth="1px"
      borderColor="border"
      borderRadius="sm"
      p="2"
    >
      <Stack gap="1.5">
        <HStack align="center" gap="1.5">
          <ImeSafeInput
            value={view.title}
            onChange={(v) => onChange({ ...view, title: v })}
            size="xs"
            fontSize="12px"
            flex="1"
            bg="bg.raised"
          />
          <ImeSafeInput
            value={view.id}
            onChange={(v) => onChange({ ...view, id: v })}
            size="xs"
            w="120px"
            fontSize="11px"
            fontFamily="mono"
            bg="bg.raised"
            title="view id"
          />
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="删除视图"
            data-interactive="true"
            onClick={onRemove}
            className="icon-btn"
          >
            <Trash2 size={11} />
          </IconButton>
        </HStack>
        <ImeSafeInput
          value={view.activationMessage.type}
          onChange={(v) =>
            onChange({
              ...view,
              activationMessage: { ...view.activationMessage, type: v },
            })
          }
          size="xs"
          fontSize="11px"
          fontFamily="mono"
          bg="bg.raised"
          title="激活消息类型"
          placeholder="activation message type (e.g. scene.ready)"
        />
        <HStack flexWrap="wrap" gap="1" pt="1">
          {allCategories.map((c) => {
            const active = view.categoryIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                data-interactive="true"
                data-active={active ? 'true' : 'false'}
                className="tab-btn"
                title={`${c.stageLabel} / ${c.title}`}
                style={
                  active
                    ? {
                        padding: '2px 8px',
                        fontSize: 10,
                        borderRadius: 3,
                        border: '1px solid var(--ig-colors-brand)',
                        background: 'var(--ig-colors-brand-muted)',
                        color: 'var(--ig-colors-brand)',
                        height: 22,
                        cursor: 'pointer',
                      }
                    : {
                        padding: '2px 8px',
                        fontSize: 10,
                        borderRadius: 3,
                        border: '1px solid var(--ig-colors-rule)',
                        background: 'var(--ig-colors-paper-raised)',
                        color: 'var(--ig-colors-ink-muted)',
                        height: 22,
                        cursor: 'pointer',
                      }
                }
              >
                {c.title}
              </button>
            )
          })}
          {allCategories.length === 0 && (
            <Text fontSize="11px" color="ink.faint">
              尚无任何分类
            </Text>
          )}
        </HStack>
      </Stack>
    </ChakraBox>
  )
}
