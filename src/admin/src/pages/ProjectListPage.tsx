/**
 * ProjectListPage — the admin entry point.
 *
 * Replaces the previous hardcoded Navigate to /projects/rocket/atlas-editor.
 * Nothing is seeded. Operators create the first project here.
 */
import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  EmptyState,
  Field,
  Flex,
  Grid,
  HStack,
  Heading,
  Input,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@chakra-ui/react'
import { FolderPlus, Plus, RefreshCw } from 'lucide-react'
import { useCreateProject, useProjects, type ListEntry } from '../features/projects/api'
import { ApiError } from '../lib/api-client'
import { PageHeader, StatusFooter } from '../components/PageHeader'

const KEBAB_RE = /^[a-z0-9-]+$/

export function ProjectListPage(): JSX.Element {
  const navigate = useNavigate()
  const projectsQuery = useProjects()
  const create = useCreateProject()
  const [showForm, setShowForm] = useState(false)
  const [newId, setNewId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && showForm) setShowForm(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm])

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setCreateError(null)
    if (!KEBAB_RE.test(newId)) {
      setCreateError('id 必须是 kebab-case（小写字母、数字、连字符）')
      return
    }
    if (!newTitle.trim()) {
      setCreateError('title 不能为空')
      return
    }
    try {
      await create.mutateAsync({ id: newId, title: newTitle.trim() })
      setShowForm(false)
      setNewId('')
      setNewTitle('')
      navigate(`/projects/${newId}/atlas-editor`)
    } catch (e) {
      if (e instanceof ApiError) {
        setCreateError(`${e.status} ${e.code}：创建失败`)
      } else {
        setCreateError((e as Error).message || '创建失败')
      }
    }
  }

  return (
    <Flex direction="column" h="100vh" bg="bg">
      <PageHeader
        crumbs={[{ label: 'Interactive Guide' }]}
        actions={
          <HStack gap="2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void projectsQuery.refetch()}
              disabled={projectsQuery.isFetching}
            >
              <HStack gap="1.5">
                <RefreshCw size={14} />
                刷新
              </HStack>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
            >
              <HStack gap="1.5">
                {showForm ? null : <Plus size={14} />}
                {showForm ? '取消' : '新建项目'}
              </HStack>
            </Button>
          </HStack>
        }
      />

      <Box as="main" flex="1" overflow="auto" py="8" px="10">
        <Container maxW="960px">
          <Stack gap="1.5" mb="6">
            <Text className="eyebrow">Project Index</Text>
            <Heading
              as="h1"
              size="2xl"
              fontWeight="400"
              letterSpacing="-0.01em"
              color="ink"
            >
              Projects
            </Heading>
          </Stack>

          {showForm && (
            <Card.Root
              mb="4"
              bg="bg.raised"
              borderColor="border"
              shadow="xs"
              data-testid="create-project-form"
              as="form"
              onSubmit={(e) => void handleCreate(e)}
            >
              <Card.Header borderBottomWidth="1px" borderColor="border" py="3" px="4">
                <Stack gap="0.5">
                  <Text className="eyebrow">New project</Text>
                  <Text fontSize="15px" fontWeight="600" color="ink">
                    项目信息
                  </Text>
                </Stack>
              </Card.Header>
              <Card.Body p="5">
                <Grid templateColumns="200px 1fr" gap="3" mb="3">
                  <Field.Root required>
                    <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
                      项目 id <Field.RequiredIndicator />
                    </Field.Label>
                    <Input
                      value={newId}
                      onChange={(e) => setNewId(e.target.value)}
                      placeholder="kebab-case, e.g. rocket"
                      fontFamily="mono"
                      size="sm"
                      autoFocus
                    />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label fontSize="12px" color="ink.muted" fontWeight="500">
                      项目 title <Field.RequiredIndicator />
                    </Field.Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="商业航天样例"
                      size="sm"
                    />
                  </Field.Root>
                </Grid>
                {createError && (
                  <Alert.Root status="error" size="sm" mb="3">
                    <Alert.Indicator />
                    <Alert.Title fontSize="12px">{createError}</Alert.Title>
                  </Alert.Root>
                )}
                <Flex justify="flex-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={create.isPending}
                  >
                    {create.isPending ? '创建中…' : '创建并进入 Atlas Editor'}
                  </Button>
                </Flex>
              </Card.Body>
            </Card.Root>
          )}

          {projectsQuery.isError && (
            <Alert.Root status="error" mb="4">
              <Alert.Indicator />
              <Alert.Title fontSize="13px">
                加载失败：{(projectsQuery.error as Error).message}
              </Alert.Title>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void projectsQuery.refetch()}
              >
                重试
              </Button>
            </Alert.Root>
          )}

          {projectsQuery.isLoading && <SkeletonTable rows={4} />}

          {projectsQuery.isSuccess && projectsQuery.data.length === 0 && (
            <EmptyState.Root
              borderColor="border.strong"
              borderStyle="dashed"
              borderWidth="2px"
              bg="bg.raised"
            >
              <EmptyState.Indicator>
                <FolderPlus size={36} strokeWidth={1.25} color="ink.faint" />
              </EmptyState.Indicator>
              <EmptyState.Title>还没有任何项目</EmptyState.Title>
              <EmptyState.Description>
                点击右上角"新建项目"开始，或者用 curl：
                <Box
                  as="pre"
                  className="mono"
                  mt="2"
                  p="2.5"
                  bg="bg.sunken"
                  borderWidth="1px"
                  borderColor="border"
                  borderRadius="sm"
                  fontSize="12px"
                  textAlign="left"
                  whiteSpace="pre-wrap"
                  wordBreak="break-all"
                >
{`curl -X POST http://localhost:8788/api/projects \\
  -H 'content-type: application/json' \\
  -d '{"id":"rocket","title":"商业航天样例"}'`}
                </Box>
              </EmptyState.Description>
              <Button variant="brand" onClick={() => setShowForm(true)}>
                <HStack gap="1.5">
                  <Plus size={14} />
                  新建项目
                </HStack>
              </Button>
            </EmptyState.Root>
          )}

          {projectsQuery.isSuccess && projectsQuery.data.length > 0 && (
            <ProjectListTable rows={projectsQuery.data} />
          )}
        </Container>
      </Box>

      <StatusFooter
        revision={0}
        isDirty={false}
        backendOk={!projectsQuery.isError}
        stats={
          projectsQuery.data
            ? {
                stages: 0,
                categories: 0,
                items: projectsQuery.data.length,
              }
            : undefined
        }
        leftExtras={
          <Text color="ink.faint">
            {projectsQuery.data?.length ?? 0} projects
          </Text>
        }
      />
    </Flex>
  )
}

function ProjectListTable({ rows }: { rows: ListEntry[] }): JSX.Element {
  return (
    <Card.Root
      bg="bg.raised"
      borderColor="border"
      shadow="xs"
      overflow="hidden"
      p="0"
    >
      <Table.Root variant="line" size="sm" interactive>
        <Table.Header className="ui-chrome">
          <Table.Row bg="bg.sunken">
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5">ID</Table.ColumnHeader>
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5">TITLE</Table.ColumnHeader>
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5">VERSION</Table.ColumnHeader>
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5">UPDATED</Table.ColumnHeader>
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5">REV</Table.ColumnHeader>
            <Table.ColumnHeader fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted" py="2.5" textAlign="right">PRODUCTS</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((p) => (
            <Table.Row
              key={p.id}
              asChild
              cursor="pointer"
            >
              <RouterLink to={`/projects/${p.id}/atlas-editor`}>
                <Table.Cell fontFamily="mono" fontSize="13px">{p.id}</Table.Cell>
                <Table.Cell fontWeight="500">{p.title}</Table.Cell>
                <Table.Cell fontFamily="mono" fontSize="13px" color="ink.muted">{p.version}</Table.Cell>
                <Table.Cell fontFamily="mono" fontSize="12px" color="ink.muted">
                  {p.updatedAt.slice(0, 19).replace('T', ' ')}
                </Table.Cell>
                <Table.Cell fontFamily="mono" fontSize="13px" color="ink.muted">{p.revision}</Table.Cell>
                <Table.Cell>
                  <HStack gap="1" justify="flex-end">
                    <Badge variant="subtle" colorPalette="brand" size="sm">
                      Atlas
                    </Badge>
                    <Badge variant="subtle" colorPalette="accent" size="sm">
                      Catalog
                    </Badge>
                  </HStack>
                </Table.Cell>
              </RouterLink>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Card.Root>
  )
}

function SkeletonTable({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <Card.Root bg="bg.raised" borderColor="border" shadow="xs" p="0" overflow="hidden">
      <Stack gap="0">
        {Array.from({ length: rows }).map((_, i) => (
          <Grid
            key={i}
            templateColumns="160px 1fr 80px 140px 60px"
            gap="4"
            px="4"
            py="3.5"
            borderBottomWidth="1px"
            borderColor="border"
          >
            <Skeleton h="14px" w="120px" />
            <Skeleton h="14px" w={`${200 + (i % 3) * 40}px`} />
            <Skeleton h="14px" w="50px" />
            <Skeleton h="14px" w="100px" />
            <Skeleton h="14px" w="32px" />
          </Grid>
        ))}
      </Stack>
    </Card.Root>
  )
}
