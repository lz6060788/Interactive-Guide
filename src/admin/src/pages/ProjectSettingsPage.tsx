/**
 * ProjectSettingsPage — operator's hub for project metadata, assets, and
 * lifecycle. Three panels:
 *   - Metadata: title / version / locale
 *   - Assets: list + upload + delete for image / video / html-bundle
 *   - Danger zone: delete project (two-step confirm)
 */
import { useEffect } from 'react'
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  Container,
  EmptyState,
  Flex,
  HStack,
  Heading,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Settings as SettingsIcon } from 'lucide-react'
import { ApiError } from '../lib/api-client'
import { useProject } from '../features/projects/api'
import { MetadataForm } from '../features/projects/settings/MetadataForm'
import { AssetsPanel } from '../features/projects/settings/AssetsPanel'
import { HtmlScenePanel } from '../features/projects/settings/HtmlScenePanel'
import { DangerZone } from '../features/projects/settings/DangerZone'
import { PageHeader, StatusFooter, TableSkeleton } from '../components/PageHeader'

export function ProjectSettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const projectQuery = useProject(projectId)

  useEffect(() => {
    if (projectQuery.isError) {
      const err = projectQuery.error
      if (err instanceof ApiError && err.status === 404) {
        navigate('/', { replace: true })
      }
    }
  }, [projectQuery.isError, projectQuery.error, navigate])

  if (projectQuery.isLoading) {
    return (
      <Flex direction="column" h="100vh">
        <PageHeader
          crumbs={[
            { label: 'Projects', to: '/' },
            { label: '加载中…' },
            { label: 'Settings' },
          ]}
        />
        <Box flex="1" p="6">
          <TableSkeleton rows={6} />
        </Box>
        <StatusFooter revision={0} isDirty={false} backendOk />
      </Flex>
    )
  }

  if (projectQuery.isError || !projectQuery.data) {
    const err = projectQuery.error as Error | null
    return (
      <Flex direction="column" h="100vh">
        <PageHeader
          crumbs={[
            { label: 'Projects', to: '/' },
            { label: projectId, to: `/projects/${projectId}/atlas-editor` },
            { label: 'Settings' },
          ]}
        />
        <Flex flex="1" align="center" justify="center">
          <EmptyState.Root maxW="400px">
            <EmptyState.Indicator>
              <SettingsIcon size={36} strokeWidth={1.25} color="ink.faint" />
            </EmptyState.Indicator>
            <EmptyState.Title>无法加载项目</EmptyState.Title>
            <EmptyState.Description>
              {err?.message ?? '项目不存在或后端错误'}
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

  const project = projectQuery.data
  const m = project.metadata

  return (
    <Flex direction="column" h="100vh">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/' },
          { label: project.title, to: `/projects/${project.id}/atlas-editor` },
          { label: 'Settings' },
        ]}
        actions={
          <HStack gap="2">
            <Button
              variant="secondary"
              size="sm"
              asChild
            >
              <RouterLink to={`/projects/${project.id}/atlas-editor`}>
                Atlas Editor
              </RouterLink>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              asChild
            >
              <RouterLink to={`/projects/${project.id}/catalog-editor`}>
                Catalog Editor
              </RouterLink>
            </Button>
          </HStack>
        }
      />
      <Box flex="1" minH="0" overflow="auto" bg="bg">
        <Container maxW="880px" py="6" pb="12">
          <Stack gap="4">
            <Flex align="baseline" justify="space-between" gap="3" mb="1">
              <Box>
                <Text className="eyebrow">Project · {project.id}</Text>
                <Heading
                  as="h1"
                  size="lg"
                  fontWeight="600"
                  color="ink"
                  mt="1"
                >
                  {project.title}
                </Heading>
              </Box>
              <Stack
                fontFamily="mono"
                fontSize="11px"
                color="ink.faint"
                textAlign="right"
                lineHeight="1.6"
                gap="0"
              >
                <Text>schema {m.schemaVersion}</Text>
                <Text>rev {m.revision}</Text>
                <Text>updated {new Date(m.updatedAt).toLocaleString('zh-CN')}</Text>
              </Stack>
            </Flex>

            <SettingsCard eyebrow="01" title="基础信息">
              <MetadataForm
                projectId={project.id}
                revision={m.revision}
                initial={{
                  title: project.title,
                  version: project.version,
                  locale: project.locale,
                }}
              />
            </SettingsCard>

            <SettingsCard eyebrow="02" title="资源">
              <AssetsPanel
                projectId={project.id}
                revision={m.revision}
                assets={project.assets.byId}
                panoramaAssetId={project.panorama.assetId}
              />
            </SettingsCard>

            <SettingsCard eyebrow="03" title="HTML 场景">
              <HtmlScenePanel
                projectId={project.id}
                revision={m.revision}
                project={project}
              />
            </SettingsCard>

            <SettingsCard eyebrow="04" title="生命周期">
              <DangerZone
                projectId={project.id}
                projectTitle={project.title}
              />
            </SettingsCard>
          </Stack>
        </Container>
      </Box>
      <StatusFooter
        revision={m.revision}
        isDirty={false}
        lastSavedAt={m.updatedAt}
        backendOk
      />
    </Flex>
  )
}

function SettingsCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card.Root bg="bg.raised" borderColor="border" shadow="xs" p="0">
      <Card.Header borderBottomWidth="1px" borderColor="border" py="3" px="4">
        <Stack gap="0.5">
          <Text className="eyebrow">{eyebrow}</Text>
          <Text fontSize="15px" fontWeight="600" color="ink">
            {title}
          </Text>
        </Stack>
      </Card.Header>
      <Card.Body p="5">{children}</Card.Body>
    </Card.Root>
  )
}
