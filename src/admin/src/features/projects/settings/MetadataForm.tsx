/**
 * MetadataForm — project title / version / locale with save + cancel.
 *
 * Mirrors the PATCH /projects/:id/metadata endpoint body shape. Save
 * uses the latest revision returned by the detail query.
 */
import { useEffect, useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { Alert, Button, Field, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useUpdateProjectMetadata } from '../api'

interface Props {
  projectId: string
  revision: number
  initial: { title: string; version: string; locale: string }
  titleLocale: string
}

interface Draft {
  title: string
  version: string
  locale: string
}

const LOCALE_SUGGESTIONS = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW']

export function MetadataForm({ projectId, revision, initial, titleLocale }: Props): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(initial)
    setSavedSnapshot(initial)
  }, [initial])

  const dirty =
    draft.title !== savedSnapshot.title ||
    draft.version !== savedSnapshot.version ||
    draft.locale !== savedSnapshot.locale

  const update = useUpdateProjectMetadata(projectId)

  const onSave = async () => {
    setError(null)
    if (!draft.title.trim()) {
      setError('标题不能为空')
      return
    }
    if (!draft.version.trim()) {
      setError('版本不能为空')
      return
    }
    if (!draft.locale.trim()) {
      setError('语言不能为空')
      return
    }
    try {
      await update.mutateAsync({
        title: draft.title.trim(),
        titleLocale,
        version: draft.version.trim(),
        locale: draft.locale.trim(),
        expectedRevision: revision,
      })
      setSavedSnapshot({
        title: draft.title.trim(),
        version: draft.version.trim(),
        locale: draft.locale.trim(),
      })
    } catch (err) {
      setError((err as Error).message || '保存失败')
    }
  }

  const onReset = () => {
    setDraft(savedSnapshot)
    setError(null)
  }

  return (
    <Stack gap="3">
      <Field.Root required>
        <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
          项目标题 <Field.RequiredIndicator />
        </Field.Label>
        <Input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          size="sm"
          bg="bg.raised"
        />
        <Field.HelperText fontSize="11px" color="ink.faint">
          面向操作员的项目名称。
        </Field.HelperText>
      </Field.Root>

      <Field.Root required>
        <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
          版本 <Field.RequiredIndicator />
        </Field.Label>
        <Input
          value={draft.version}
          onChange={e => setDraft(d => ({ ...d, version: e.target.value }))}
          size="sm"
          bg="bg.raised"
          fontFamily="mono"
        />
        <Field.HelperText fontSize="11px" color="ink.faint">
          例如 1.0.0、2026-Q2。
        </Field.HelperText>
      </Field.Root>

      <Field.Root required>
        <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
          语言 <Field.RequiredIndicator />
        </Field.Label>
        <Input
          list="locale-suggestions"
          value={draft.locale}
          onChange={e => setDraft(d => ({ ...d, locale: e.target.value }))}
          size="sm"
          bg="bg.raised"
          fontFamily="mono"
        />
        <datalist id="locale-suggestions">
          {LOCALE_SUGGESTIONS.map(l => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <Field.HelperText fontSize="11px" color="ink.faint">
          BCP-47 locale，例如 zh-CN。
        </Field.HelperText>
      </Field.Root>

      {error && (
        <Alert.Root status="error" size="sm">
          <Alert.Indicator />
          <Alert.Title fontSize="12px">{error}</Alert.Title>
        </Alert.Root>
      )}

      <HStack align="center" gap="2" pt="1" borderTopWidth="1px" borderColor="border">
        {dirty && (
          <Text fontFamily="mono" fontSize="11px" color="state.warn" data-testid="metadata-dirty">
            有未保存的修改
          </Text>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={!dirty || update.isPending}
          data-testid="btn-reset-metadata"
        >
          <HStack gap="1.5">
            <RotateCcw size={14} />
            重置
          </HStack>
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={onSave}
          disabled={!dirty}
          loading={update.isPending}
          data-testid="btn-save-metadata"
        >
          <HStack gap="1.5">
            <Save size={14} />
            保存
          </HStack>
        </Button>
      </HStack>
    </Stack>
  )
}
