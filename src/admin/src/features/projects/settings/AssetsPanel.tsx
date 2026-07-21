/**
 * AssetsPanel — list, upload, delete project assets.
 *
 * Supports three kinds: image (panorama / thumbnail), video (edge
 * transition), html-bundle (independent scene). Each kind has its own
 * upload row; the kind list shows what currently exists with delete
 * buttons. Image assets can be bound as the panorama base via
 * "设为底图" — that triggers a PUT /panorama to set panorama.assetId.
 */
import { useState, useRef, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Image, Film, Upload, Trash2, ImagePlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AssetDefinition, GuideProject } from '@domain/project-types'
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
import {
  useDeleteAsset,
  useUploadAsset,
  type AssetKind,
} from '../api'
import { useUpdatePanorama, atlasKeys } from '../../atlas-editor/api'
import { ApiError } from '../../../lib/api-client'

interface Props {
  projectId: string
  revision: number
  assets: Record<string, AssetDefinition>
  panoramaAssetId: string
}

interface KindDef {
  kind: AssetKind
  label: string
  icon: LucideIcon
  accept: string
  hint: string
}

const KINDS: KindDef[] = [
  {
    kind: 'image',
    label: '图片',
    icon: Image,
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    hint: '用于全景图、缩略图、背景图。上传后点"设为底图"绑定到全景画布。',
  },
  {
    kind: 'video',
    label: '视频',
    icon: Film,
    accept: 'video/mp4,video/webm,video/quicktime',
    hint: '用于节点间转场动画。',
  },
  // html-bundle 故意不放这里 — 它必须挂在某个 scene 上，资产 id 也有
  // scene-${sceneId} 的约定，由 HtmlScenePanel 内的上传入口统一处理。
]

export function AssetsPanel({
  projectId,
  revision,
  assets,
  panoramaAssetId,
}: Props): JSX.Element {
  const grouped = groupByKind(assets)
  const imageCount = grouped.get('image')?.length ?? 0
  return (
    <Stack gap="3">
      {!panoramaAssetId && (
        <Alert.Root status="info" size="sm" data-testid="banner-no-panorama">
          <Alert.Indicator />
          <Stack gap="0.5" flex="1">
            <Alert.Title fontSize="12px" fontWeight="600">
              全景画布尚未绑定底图
            </Alert.Title>
            <Alert.Description fontSize="11px">
              上传一张图片后，点行尾的 <Text as="span" fontFamily="mono" fontWeight="600">设为底图</Text> 即可在 Atlas 编辑器中显示。
              {imageCount > 0 && `当前有 ${imageCount} 张图片未绑定。`}
            </Alert.Description>
          </Stack>
        </Alert.Root>
      )}
      {KINDS.map((k) => (
        <KindRow
          key={k.kind}
          def={k}
          projectId={projectId}
          revision={revision}
          items={grouped.get(k.kind) ?? []}
          panoramaAssetId={panoramaAssetId}
        />
      ))}
    </Stack>
  )
}

function groupByKind(
  byId: Record<string, AssetDefinition>,
): Map<AssetKind, AssetDefinition[]> {
  const m = new Map<AssetKind, AssetDefinition[]>()
  for (const def of Object.values(byId)) {
    if (!m.has(def.kind)) m.set(def.kind, [])
    m.get(def.kind)!.push(def)
  }
  return m
}

interface KindRowProps {
  def: KindDef
  projectId: string
  revision: number
  items: AssetDefinition[]
  panoramaAssetId: string
}

function KindRow({
  def,
  projectId,
  revision,
  items,
  panoramaAssetId,
}: KindRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draftId, setDraftId] = useState<string>('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const upload = useUploadAsset(projectId)
  const remove = useDeleteAsset(projectId)
  const updatePanorama = useUpdatePanorama(projectId)
  const qc = useQueryClient()
  const Icon = def.icon

  const onPick = () => inputRef.current?.click()
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const fallbackId = inferAssetId(file.name)
    const assetId = (draftId.trim() || fallbackId).trim()
    if (!assetId) {
      setUploadError('请提供 asset id 或选择一个文件名可解析的文件')
      return
    }
    try {
      await upload.mutateAsync({
        kind: def.kind,
        assetId,
        expectedRevision: revision,
        file,
      })
      setDraftId('')
    } catch (err) {
      setUploadError((err as Error).message || '上传失败')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDelete = async (assetId: string) => {
    if (!window.confirm(`确认删除 asset "${assetId}"？该操作不可撤销。`)) return
    try {
      await remove.mutateAsync({ assetId, expectedRevision: revision })
    } catch (err) {
      setUploadError((err as Error).message || '删除失败')
    }
  }

  const onSetPanorama = async (assetId: string) => {
    setUploadError(null)
    try {
      const cached = qc.getQueryData<GuideProject>(atlasKeys.project(projectId))
      if (!cached) {
        setUploadError('项目数据未加载，请刷新页面后再试')
        return
      }
      await updatePanorama.mutateAsync({
        panorama: { ...cached.panorama, assetId },
        expectedRevision: revision,
      })
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(`${err.status} ${err.code}：${err.message}`)
      } else {
        setUploadError((err as Error).message || '设置底图失败')
      }
    }
  }

  return (
    <ChakraBox
      data-testid={`assets-${def.kind}`}
      bg="bg.overlay"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      p="3.5"
    >
      <Stack gap="2.5">
        <HStack align="center" gap="2.5">
          <ChakraBox color="brand">
            <Icon size={16} strokeWidth={1.75} />
          </ChakraBox>
          <Stack gap="0.5" flex="1" minW="0">
            <HStack gap="2">
              <Text fontSize="13px" fontWeight="600" color="ink">
                {def.label}
              </Text>
              <Text fontFamily="mono" fontSize="10px" color="ink.faint">
                {items.length}
              </Text>
            </HStack>
            <Text fontSize="11px" color="ink.faint">
              {def.hint}
            </Text>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            accept={def.accept}
            onChange={onFile}
            style={{ display: 'none' }}
          />
          <Button
            variant="brand"
            size="sm"
            onClick={onPick}
            loading={upload.isPending}
            data-testid={`btn-upload-${def.kind}`}
          >
            <HStack gap="1.5">
              <Upload size={14} />
              上传
            </HStack>
          </Button>
        </HStack>

        <HStack align="center" gap="1.5" fontSize="11px" color="ink.muted">
          <Text>asset id（可选，留空则从文件名推断）:</Text>
          <Input
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            placeholder="asset-xxx"
            size="xs"
            fontFamily="mono"
            bg="bg.raised"
          />
        </HStack>

        {uploadError && (
          <Text role="alert" fontSize="11px" color="state.error">
            {uploadError}
          </Text>
        )}

        {items.length === 0 ? (
          <Text
            fontSize="11px"
            color="ink.faint"
            fontStyle="italic"
            py="1"
          >
            尚未上传任何 {def.label.toLowerCase()}。
          </Text>
        ) : (
          <Stack gap="1" as="ul" listStyleType="none" m="0" p="0">
            {items.map((it) => (
              <HStack
                key={it.id}
                as="li"
                data-testid={`asset-row-${it.id}`}
                align="center"
                gap="2"
                px="2"
                py="1.5"
                borderRadius="sm"
                borderWidth="1px"
                borderColor={def.kind === 'image' && it.id === panoramaAssetId ? 'brand' : 'border'}
                borderStyle={def.kind === 'image' && it.id === panoramaAssetId ? 'solid' : undefined}
                bg="bg.raised"
              >
                <Text
                  fontFamily="mono"
                  fontSize="12px"
                  color="ink"
                  flex="1"
                  minW="0"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                  title={it.id}
                >
                  {it.id}
                </Text>
                {def.kind === 'image' && it.id === panoramaAssetId && (
                  <Badge
                    variant="subtle"
                    colorPalette="brand"
                    size="xs"
                    data-testid={`badge-current-panorama-${it.id}`}
                  >
                    当前底图
                  </Badge>
                )}
                {def.kind === 'image' && it.id !== panoramaAssetId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onSetPanorama(it.id)}
                    loading={updatePanorama.isPending}
                    disabled={updatePanorama.isPending}
                    data-testid={`btn-set-panorama-${it.id}`}
                  >
                    <HStack gap="1">
                      <ImagePlus size={11} />
                      设为底图
                    </HStack>
                  </Button>
                )}
                {it.size !== undefined && (
                  <Text fontFamily="mono" fontSize="10px" color="ink.faint">
                    {formatBytes(it.size)}
                  </Text>
                )}
                {it.mimeType && (
                  <Text fontFamily="mono" fontSize="10px" color="ink.faint">
                    {it.mimeType}
                  </Text>
                )}
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`删除 asset ${it.id}`}
                  data-testid={`btn-delete-asset-${it.id}`}
                  data-interactive="true"
                  onClick={() => void onDelete(it.id)}
                  disabled={remove.isPending}
                  className="icon-btn"
                >
                  <Trash2 size={11} />
                </IconButton>
              </HStack>
            ))}
          </Stack>
        )}
      </Stack>
    </ChakraBox>
  )
}

function inferAssetId(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return base || `asset-${Date.now()}`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
