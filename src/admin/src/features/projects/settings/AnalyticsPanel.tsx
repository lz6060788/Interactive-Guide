import { useEffect, useState } from 'react'
import { Alert, Box, Button, Field, HStack, Input, Stack, Switch, Text } from '@chakra-ui/react'
import { RotateCcw, Save } from 'lucide-react'
import type { ProjectIntegrations } from '@domain/project-types'
import { useUpdateProjectIntegrations } from '../api'

interface Draft {
  enabled: boolean
  appKey: string
  pageType: string
  name: string
  defaultSource: string
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
    appKey: analytics?.appKey ?? '',
    pageType: analytics?.pageType ?? '',
    name: analytics?.name ?? '',
    defaultSource: analytics?.defaultSource ?? '',
  }
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
      const required = [draft.appKey, draft.pageType, draft.name, draft.defaultSource]
      if (draft.enabled && required.some(value => !value.trim())) {
        throw new Error('启用埋点时，App Key、页面类型、产业链名称和默认来源均为必填项')
      }
      const integrations: ProjectIntegrations = {
        ...initial,
        ...(draft.enabled
          ? {
              analytics: {
                enabled: true,
                provider: 'weblog',
                appKey: draft.appKey.trim(),
                pageType: draft.pageType.trim(),
                name: draft.name.trim(),
                defaultSource: draft.defaultSource.trim(),
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
            Atlas WeBlog 埋点
          </Text>
          <Text fontSize="11px" color="ink.faint" mt="0.5">
            仅 Atlas 上报页面曝光、停留时长、分享点击和分享回流。
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
          <ConfigInput
            label="App Key"
            value={draft.appKey}
            onChange={value => updateField('appKey', value)}
            required
          />
          <ConfigInput
            label="页面类型"
            value={draft.pageType}
            onChange={value => updateField('pageType', value)}
            placeholder="visindustry"
            required
          />
          <ConfigInput
            label="产业链名称"
            value={draft.name}
            onChange={value => updateField('name', value)}
            required
          />
          <ConfigInput
            label="默认来源"
            value={draft.defaultSource}
            onChange={value => updateField('defaultSource', value)}
            placeholder="industry"
            required
          />
          <Text fontSize="11px" color="ink.faint">
            页面 URL 中存在非空 source 参数时，会覆盖默认来源。
          </Text>
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

function ConfigInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}): JSX.Element {
  return (
    <Field.Root required={required}>
      <Field.Label fontSize="12px" color="ink.muted">
        {label} {required && <Field.RequiredIndicator />}
      </Field.Label>
      <Input
        size="sm"
        value={value}
        onChange={event => onChange(event.target.value)}
        bg="bg.raised"
        placeholder={placeholder}
      />
    </Field.Root>
  )
}
