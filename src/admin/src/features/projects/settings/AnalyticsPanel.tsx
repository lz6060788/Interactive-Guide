import { useEffect, useState } from 'react'
import { Alert, Box, Button, Field, HStack, Input, Stack, Switch, Text } from '@chakra-ui/react'
import { RotateCcw, Save } from 'lucide-react'
import type { ProjectIntegrations } from '@domain/project-types'
import { useUpdateProjectIntegrations } from '../api'

interface Draft {
  enabled: boolean
  profileId: string
  pageType: string
  contentName: string
  defaultSource: string
  dimensionsJson: string
}

interface Props {
  projectId: string
  revision: number
  initial: ProjectIntegrations
}

function toDraft(integrations: ProjectIntegrations): Draft {
  const analytics = integrations.analytics
  return {
    enabled: analytics?.enabled ?? false,
    profileId: analytics?.profileId ?? '',
    pageType: analytics?.pageType ?? '',
    contentName: analytics?.contentName ?? '',
    defaultSource: analytics?.defaultSource ?? '',
    dimensionsJson: JSON.stringify(analytics?.dimensions ?? {}, null, 2),
  }
}

function normalizeDimensions(value: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined
  const parsed: unknown = JSON.parse(value)
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('扩展参数必须是 JSON 对象')
  }
  const entries = Object.entries(parsed)
  if (!entries.every(([key, item]) => key.trim() && typeof item === 'string')) {
    throw new Error('扩展参数的键和值都必须是非空字符串')
  }
  return Object.fromEntries(entries) as Record<string, string>
}

export function AnalyticsPanel({ projectId, revision, initial }: Props): JSX.Element {
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
  const updateField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const save = async () => {
    setError(null)
    try {
      const dimensions = normalizeDimensions(draft.dimensionsJson)
      if (draft.enabled && (!draft.profileId.trim() || !draft.pageType.trim())) {
        throw new Error('启用埋点时，Profile ID 和页面类型为必填项')
      }
      const integrations: ProjectIntegrations = {
        ...initial,
        ...(draft.enabled
          ? {
              analytics: {
                enabled: true,
                provider: 'weblog',
                profileId: draft.profileId.trim(),
                pageType: draft.pageType.trim(),
                ...(draft.contentName.trim() ? { contentName: draft.contentName.trim() } : {}),
                ...(draft.defaultSource.trim()
                  ? { defaultSource: draft.defaultSource.trim() }
                  : {}),
                ...(dimensions && Object.keys(dimensions).length ? { dimensions } : {}),
              },
            }
          : { analytics: undefined }),
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
            WeBlog 埋点
          </Text>
          <Text fontSize="11px" color="ink.faint" mt="0.5">
            Atlas 与 Catalog 共享触发语义，按各自产品维度上报。
          </Text>
        </Box>
        <Switch.Root
          checked={draft.enabled}
          onCheckedChange={event => updateField('enabled', event.checked)}
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
          <Field.Root required>
            <Field.Label fontSize="12px" color="ink.muted">
              Profile ID <Field.RequiredIndicator />
            </Field.Label>
            <Input
              size="sm"
              value={draft.profileId}
              onChange={event => updateField('profileId', event.target.value)}
              bg="bg.raised"
            />
          </Field.Root>
          <Field.Root required>
            <Field.Label fontSize="12px" color="ink.muted">
              页面类型 <Field.RequiredIndicator />
            </Field.Label>
            <Input
              size="sm"
              value={draft.pageType}
              onChange={event => updateField('pageType', event.target.value)}
              bg="bg.raised"
              placeholder="interactive-guide"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              内容名称
            </Field.Label>
            <Input
              size="sm"
              value={draft.contentName}
              onChange={event => updateField('contentName', event.target.value)}
              bg="bg.raised"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              默认来源
            </Field.Label>
            <Input
              size="sm"
              value={draft.defaultSource}
              onChange={event => updateField('defaultSource', event.target.value)}
              bg="bg.raised"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="12px" color="ink.muted">
              扩展参数（JSON）
            </Field.Label>
            <textarea
              rows={4}
              value={draft.dimensionsJson}
              onChange={event => updateField('dimensionsJson', event.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: '6px',
                background: 'var(--chakra-colors-bg-raised)',
                color: 'var(--chakra-colors-ink)',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                padding: '8px',
              }}
            />
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
          data-testid="btn-save-analytics"
        >
          <Save size={14} /> 保存
        </Button>
      </HStack>
    </Stack>
  )
}
