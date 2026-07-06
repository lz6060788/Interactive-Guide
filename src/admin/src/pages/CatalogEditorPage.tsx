/**
 * CatalogEditorPage — page that loads a project and mounts CatalogEditor.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │ TopBar (project title + breadcrumbs)               │
 *   ├────────────────────────────────────────────────────┤
 *   │ StageTabs                                          │
 *   ├────────────────────────────────────────────────────┤
 *   │ Toolbar                                            │
 *   ├──────────┬───────────────────┬─────────────────────┤
 *   │ Canvas   │ Preview           │ Inspector           │
 *   └──────────┴───────────────────┴─────────────────────┘
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
import { ListTree, Settings as SettingsIcon } from 'lucide-react'
import { useProject } from '../features/projects/api'
import { CatalogEditor } from '../features/catalog-editor/components/CatalogEditor'
import { useCatalogEditorStore } from '../features/catalog-editor/store'
import { ApiError } from '../lib/api-client'
import { PageHeader, StatusFooter, TableSkeleton } from '../components/PageHeader'

export function CatalogEditorPage(): JSX.Element {
  const navigate = useNavigate()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const projectQuery = useProject(projectId)
  const isDirty = useCatalogEditorStore((s) => s.dirty)

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
        <PageHeader crumbs={[{ label: 'Projects', to: '/' }, { label: 'Catalog Editor' }]} />
        <Flex flex="1" align="center" justify="center">
          <EmptyState.Root maxW="400px">
            <EmptyState.Indicator>
              <ListTree size={36} strokeWidth={1.25} color="ink.faint" />
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
  const stagesArr = project.knowledge.stages as unknown as Array<{
    categories: Array<{ itemIds: string[] }>
  }>
  const catCount = stagesArr.reduce((acc, s) => acc + s.categories.length, 0)
  const itemCount = Object.keys(project.knowledge.items).length

  return (
    <Flex direction="column" h="100vh">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/' },
          { label: project.title, to: `/projects/${project.id}/catalog-editor` },
          { label: 'Catalog Editor' },
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
        <CatalogEditor projectId={project.id} />
      </Box>
      <StatusFooter
        revision={project.metadata.revision}
        isDirty={isDirty}
        lastSavedAt={project.metadata.updatedAt}
        backendOk={!projectQuery.isError}
        stats={{
          stages: stagesArr.length,
          categories: catCount,
          items: itemCount,
        }}
        leftExtras={
          <Text color="ink.faint">
            {catCount} cats · {itemCount} items
          </Text>
        }
      />
    </Flex>
  )
}
