import { useEffect, useState } from 'react'
import { Alert, Box, Button, Field, HStack, Input, Stack, Switch, Text } from '@chakra-ui/react'
import { RotateCcw, Save } from 'lucide-react'
import type { AssetDefinition, ProjectIntegrations } from '@domain/project-types'
import { useUpdateProjectIntegrations } from '../api'

interface Draft {
  enabled: boolean
  title: string
  description: string
  imageAssetId: string
}

interface Props {
  projectId: string
  projectTitle: string
  revision: number
  initial: ProjectIntegrations
  assets: Record<string, AssetDefinition>
}

function toDraft(integrations: ProjectIntegrations): Draft {
  const share = integrations.share
  return {
    enabled: share?.enabled ?? false,
    title: share?.title ?? '',
    description: share?.description ?? '',
    imageAssetId: share?.imageAssetId ?? '',
  }
}

export function SharePanel({
  projectId,
  projectTitle,
  revision,
  initial,
  assets,
}: Props): JSX.Element {
  const [draft, setDraft] = useState(() => toDraft(initial))
  const [snapshot, setSnapshot] = useState(() => toDraft(initial))
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateProjectIntegrations(projectId)

  useEffect(() => {
    const next = toDraft(initial)
    setDraft(next)
    setSnapshot(next)
  }, [initial])

  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot)
  const imageAssets = Object.values(assets)
    .filter(asset => asset.kind === 'image')
    .sort((a, b) => a.id.localeCompare(b.id))

  const save = async () => {
    setError(null)
    try {
      if (draft.imageAssetId && assets[draft.imageAssetId]?.kind !== 'image') {
        throw new Error('分享封面必须引用项目中的图片资源')
      }
      const integrations: ProjectIntegrations = {
        ...initial,
        ...(draft.enabled
          ? {
              share: {
                enabled: true,
                ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
                ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
                ...(draft.imageAssetId ? { imageAssetId: draft.imageAssetId } : {}),
              },
            }
          : { share: undefined }),
      }
      await update.mutateAsync({ integrations, expectedRevision: revision })
      setSnapshot(draft)
    } catch (reason) {
      setError((reason as Error).message || '保存失败')
    }
  }

  return (
    <Stack gap="3">
      <HStack justify="space-between" align="center">
        <Box>
          <Text fontSize="13px" fontWeight="600" color="ink">
            客户端分享
          </Text>
          <Text fontSize="11px" color="ink.faint" mt="0.5">
            F10 环境优先使用 shareUrlCard，普通浏览器自动降级。
          </Text>
        </Box>
        <Switch.Root
          checked={draft.enabled}
          onCheckedChange={event => setDraft(current => ({ ...current, enabled: event.checked }))}
          colorPalette="brand"
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label fontSize="12px">启用</Switch.Label>
        </Switch.Root>
      </HStack>

      {draft.enabled && (
        <Stack gap="3">
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              分享标题
            </Field.Label>
            <Input
              size="sm"
              value={draft.title}
              onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
              bg="bg.raised"
              placeholder={projectTitle}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              分享描述
            </Field.Label>
            <Input
              size="sm"
              value={draft.description}
              onChange={event =>
                setDraft(current => ({ ...current, description: event.target.value }))
              }
              bg="bg.raised"
              placeholder={draft.title.trim() || projectTitle}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              分享封面
            </Field.Label>
            <select
              value={draft.imageAssetId}
              onChange={event =>
                setDraft(current => ({ ...current, imageAssetId: event.target.value }))
              }
              style={{
                width: '100%',
                height: '32px',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: '6px',
                background: 'var(--chakra-colors-bg-raised)',
                color: 'var(--chakra-colors-ink)',
                padding: '0 8px',
                fontSize: '12px',
              }}
            >
              <option value="">不配置封面</option>
              {imageAssets.map(asset => (
                <option key={asset.id} value={asset.id}>
                  {asset.id}
                </option>
              ))}
            </select>
          </Field.Root>
        </Stack>
      )}

      {error && (
        <Alert.Root status="error" size="sm">
          <Alert.Indicator />
          <Alert.Title fontSize="12px">{error}</Alert.Title>
        </Alert.Root>
      )}

      <HStack gap="2" pt="1" borderTopWidth="1px" borderColor="border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(snapshot)
            setError(null)
          }}
          disabled={!dirty || update.isPending}
        >
          <RotateCcw size={14} /> 重置
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={save}
          disabled={!dirty}
          loading={update.isPending}
          data-testid="btn-save-share"
        >
          <Save size={14} /> 保存
        </Button>
      </HStack>
    </Stack>
  )
}
