/**
 * DangerZone — delete project with confirmation.
 *
 * Uses two-step confirmation: the button toggles an "armed" state, then
 * a final click inside the armed state triggers the delete. Avoids
 * accidental deletes from a single mis-click.
 */
import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import {
  Alert,
  Box,
  Button,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useDeleteProject } from '../api'

interface Props {
  projectId: string
  projectTitle: string
}

export function DangerZone({ projectId, projectTitle }: Props): JSX.Element {
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const del = useDeleteProject(projectId)

  const onClick = async () => {
    setError(null)
    if (!armed) {
      setArmed(true)
      window.setTimeout(() => setArmed(false), 5000)
      return
    }
    try {
      await del.mutateAsync()
    } catch (err) {
      setError((err as Error).message || '删除失败')
      setArmed(false)
    }
  }

  return (
    <Box
      data-testid="danger-zone"
      bg="state.error.muted"
      borderWidth="1px"
      borderColor="state.error"
      borderRadius="md"
      p="3.5"
    >
      <Stack gap="2">
        <HStack align="center" gap="2">
          <Box color="state.error">
            <AlertTriangle size={16} strokeWidth={1.75} />
          </Box>
          <Text fontSize="13px" fontWeight="600" color="state.error">
            危险操作
          </Text>
        </HStack>
        <Text fontSize="12px" color="ink" lineHeight="1.55">
          删除项目 <strong>{projectTitle}</strong> 将永久移除所有数据：知识条目、布局、配置、已上传资源。
          该操作不可撤销，请确认后操作。
        </Text>
        {error && (
          <Alert.Root status="error" size="sm">
            <Alert.Indicator />
            <Alert.Title fontSize="12px">{error}</Alert.Title>
          </Alert.Root>
        )}
        <HStack gap="2">
          <Button
            variant={armed ? 'danger' : 'secondary'}
            size="sm"
            onClick={onClick}
            loading={del.isPending}
            data-testid="btn-delete-project"
          >
            <HStack gap="1.5">
              <Trash2 size={14} />
              {armed ? '再次点击确认删除' : '删除项目'}
            </HStack>
          </Button>
          {armed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArmed(false)}
              data-testid="btn-cancel-delete"
            >
              取消
            </Button>
          )}
        </HStack>
      </Stack>
    </Box>
  )
}
