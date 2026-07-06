/**
 * AtlasEditorPage — the page that loads a project and mounts AtlasEditor.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │ TopBar (project title + breadcrumbs)               │
 *   ├──────────┬─────────────────────────────────────────┤
 *   │          │ Toolbar                                 │
 *   │  Struc-  ├────────────────────────────┬────────────┤
 *   │  ture    │ Canvas                    │ Preview    │
 *   │          │                           │            │
 *   │          ├───────────────────────────┴────────────┤
 *   ├──────────┴─────────────────────────────────────────┤
 *   │ StatusBar                                          │
 *   └────────────────────────────────────────────────────┘
 */
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  EmptyState,
  Flex,
  HStack,
  Text,
} from '@chakra-ui/react'
import { Compass, Settings as SettingsIcon } from 'lucide-react'
import { useProject } from '../features/projects/api'
import { AtlasEditor } from '../features/atlas-editor/components/AtlasEditor'
import { useAtlasEditorStore } from '../features/atlas-editor/store'
import { ApiError } from '../lib/api-client'
import { PageHeader, StatusFooter, TableSkeleton } from '../components/PageHeader'

export function AtlasEditorPage(): JSX.Element {
  const navigate = useNavigate()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const projectQuery = useProject(projectId)
  const isDirty = useAtlasEditorStore((s) => s.dirty)

  if (projectQuery.isLoading) {
    return (
      <Flex direction="column" h="100vh">
        <PageHeader crumbs={[{ label: 'Projects', to: '/' }, { label: '加载中…' }]} />
        <Box flex="1" p="6">
          <TableSkeleton rows={6} />
        </Box>
        <StatusFooter revision={0} isDirty={false} backendOk />
      </Flex>
    )
  }

  if (projectQuery.isError) {
    const err = projectQuery.error
    const notFound = err instanceof ApiError && err.status === 404
    return (
      <Flex direction="column" h="100vh">
        <PageHeader crumbs={[{ label: 'Projects', to: '/' }, { label: 'Atlas Editor' }]} />
        <Flex flex="1" align="center" justify="center">
          <EmptyState.Root maxW="400px">
            <EmptyState.Indicator>
              <Compass size={36} strokeWidth={1.25} color="ink.faint" />
            </EmptyState.Indicator>
            <EmptyState.Title>
              {notFound ? `项目 "${projectId}" 不存在` : '加载失败'}
            </EmptyState.Title>
            <EmptyState.Description>
              {notFound
                ? '可能尚未创建，或 id 拼写错误。返回项目列表重试。'
                : (err as Error).message}
            </EmptyState.Description>
            <Button variant="primary" onClick={() => navigate('/')}>
              返回项目列表
            </Button>
          </EmptyState.Root>
        </Flex>
        <StatusFooter revision={0} isDirty={false} backendOk={false} />
      </Flex>
    )
  }

  const project = projectQuery.data!
  const stageCount = project.knowledge.stages.length
  const catCount = project.knowledge.stages.reduce((acc, s) => acc + s.categories.length, 0)
  const itemCount = Object.keys(project.knowledge.items).length
  const hotspotCount = Object.values(project.panorama.categories).filter((c) => c?.hotspot).length

  return (
    <Flex direction="column" h="100vh">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/' },
          { label: project.title, to: `/projects/${project.id}/atlas-editor` },
          { label: 'Atlas Editor' },
        ]}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/projects/${project.id}/settings`)}
            data-testid="btn-open-settings"
          >
            <HStack gap="1.5">
              <SettingsIcon size={14} />
              Settings
            </HStack>
          </Button>
        }
      />
      <Box flex="1" minH="0">
        <AtlasEditor projectId={project.id} />
      </Box>
      <StatusFooter
        revision={project.metadata.revision}
        isDirty={isDirty}
        lastSavedAt={project.metadata.updatedAt}
        backendOk={!projectQuery.isError}
        stats={{
          stages: stageCount,
          categories: catCount,
          items: hotspotCount + itemCount,
        }}
        leftExtras={
          <Text color="ink.faint">
            {hotspotCount} hotspots · {itemCount} items
          </Text>
        }
      />
    </Flex>
  )
}
