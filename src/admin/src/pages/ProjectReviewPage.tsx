import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
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
  Heading,
  HStack,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader, StatusFooter, TableSkeleton } from '../components/PageHeader'
import { ApiError } from '../lib/api-client'
import { useProject } from '../features/projects/api'
import { useApproveReviewSession, useReviewSession } from '../features/review/api'

export function ProjectReviewPage(): JSX.Element {
  const { projectId = '', reviewId = '' } = useParams<{
    projectId: string
    reviewId: string
  }>()
  const projectQuery = useProject(projectId)
  const reviewQuery = useReviewSession(reviewId)
  const approveReview = useApproveReviewSession(reviewId)
  const [notes, setNotes] = useState('')
  const [operationError, setOperationError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setOperationError(null)
    await Promise.all([reviewQuery.refetch(), projectQuery.refetch()])
  }

  if (projectQuery.isLoading || reviewQuery.isLoading) {
    return (
      <Flex direction="column" h="100vh">
        <PageHeader crumbs={[{ label: 'Projects', to: '/' }, { label: '加载校验会话…' }]} />
        <Box flex="1" p="6">
          <TableSkeleton rows={5} />
        </Box>
        <StatusFooter revision={0} isDirty={false} backendOk />
      </Flex>
    )
  }

  const session = reviewQuery.data
  const project = projectQuery.data
  const routeMatchesSession = Boolean(session && session.projectId === projectId)
  if (projectQuery.isError || reviewQuery.isError || !project || !session || !routeMatchesSession) {
    const error = reviewQuery.error ?? projectQuery.error
    const description =
      !routeMatchesSession && session
        ? '该校验会话不属于 URL 中的项目，已禁止确认。请使用工作台返回的校验链接。'
        : error instanceof ApiError && error.status === 404
          ? '项目或校验会话不存在。请让 Agent 重新发起校验。'
          : ((error as Error | null)?.message ?? '无法读取校验状态。')
    return (
      <Flex direction="column" h="100vh">
        <PageHeader crumbs={[{ label: 'Projects', to: '/' }, { label: '人工校验' }]} />
        <Flex flex="1" align="center" justify="center" p="6">
          <EmptyState.Root maxW="460px">
            <EmptyState.Indicator>
              <ShieldCheck size={38} strokeWidth={1.25} />
            </EmptyState.Indicator>
            <EmptyState.Title>无法进入本次校验</EmptyState.Title>
            <EmptyState.Description>{description}</EmptyState.Description>
            <Button variant="secondary" onClick={() => void refresh()}>
              重新读取
            </Button>
          </EmptyState.Root>
        </Flex>
        <StatusFooter revision={session?.currentRevision ?? 0} isDirty={false} backendOk={false} />
      </Flex>
    )
  }

  const canApprove = session.status === 'pending' && !approveReview.isPending
  const approve = async (): Promise<void> => {
    setOperationError(null)
    try {
      await approveReview.mutateAsync({
        expectedRevision: session.currentRevision,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'REVISION_CONFLICT' || error.code === 'REVIEW_ALREADY_APPROVED')
      ) {
        setOperationError('项目或校验状态刚刚发生变化。正在刷新状态，请重新检查后再确认。')
        return
      }
      setOperationError((error as Error).message)
    }
  }

  return (
    <Flex direction="column" h="100vh">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/' },
          { label: projectId, to: `/projects/${projectId}/atlas-editor` },
          { label: '人工校验' },
        ]}
        actions={
          <HStack gap="2">
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              刷新状态
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <RouterLink to={`/projects/${projectId}/atlas-editor`} target="_blank">
                打开 Atlas
              </RouterLink>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <RouterLink to={`/projects/${projectId}/catalog-editor`} target="_blank">
                打开 Catalog
              </RouterLink>
            </Button>
          </HStack>
        }
      />

      <Box flex="1" minH="0" overflow="auto" bg="bg">
        <Container maxW="960px" py="8" pb="12">
          <Stack gap="6">
            <Box>
              <Text className="eyebrow">Human review · {session.id}</Text>
              <Flex align="end" justify="space-between" gap="5" mt="2" wrap="wrap">
                <Box>
                  <Heading as="h1" size="xl" fontWeight="600" color="ink">
                    双产物交付校验
                  </Heading>
                  <Text color="ink.muted" fontSize="14px" mt="2" maxW="620px">
                    分别检查 Atlas 与
                    Catalog。确认后，只有当前修订可进入正式发布；任何后续修改都会自动使本次确认失效。
                  </Text>
                </Box>
                <ReviewStatusBadge status={session.status} />
              </Flex>
            </Box>

            <Grid
              templateColumns={{ base: '1fr', md: 'minmax(0, 1.1fr) minmax(300px, 0.9fr)' }}
              gap="5"
            >
              <Card.Root bg="bg.raised" borderColor="border" shadow="xs">
                <Card.Header borderBottomWidth="1px" borderColor="border" py="4">
                  <Text className="eyebrow">Revision ledger</Text>
                  <Text fontSize="16px" fontWeight="600" color="ink" mt="1">
                    修订轨迹
                  </Text>
                </Card.Header>
                <Card.Body py="6">
                  <RevisionLedger
                    openedRevision={session.openedRevision}
                    currentRevision={session.currentRevision}
                    approvedRevision={session.approvedRevision}
                    status={session.status}
                  />
                </Card.Body>
              </Card.Root>

              <Card.Root bg="bg.raised" borderColor="border" shadow="xs">
                <Card.Header borderBottomWidth="1px" borderColor="border" py="4">
                  <Text className="eyebrow">Approval</Text>
                  <Text fontSize="16px" fontWeight="600" color="ink" mt="1">
                    交付确认
                  </Text>
                </Card.Header>
                <Card.Body>
                  <Stack gap="4">
                    <ReviewGuidance status={session.status} />
                    {operationError && (
                      <Alert.Root status="error" size="sm">
                        <Alert.Indicator />
                        <Alert.Title fontSize="12px">{operationError}</Alert.Title>
                      </Alert.Root>
                    )}
                    {session.status === 'pending' && (
                      <Field.Root>
                        <Field.Label fontSize="12px">校验备注（可选）</Field.Label>
                        <Textarea
                          value={notes}
                          onChange={event => setNotes(event.target.value)}
                          maxLength={2000}
                          rows={4}
                          placeholder="例如：Atlas 热点、Catalog 聚焦与中英文文案均已检查"
                          resize="vertical"
                        />
                      </Field.Root>
                    )}
                    {session.notes && (
                      <Box bg="bg.sunken" borderRadius="sm" p="3">
                        <Text className="eyebrow">Confirmed note</Text>
                        <Text fontSize="13px" color="ink" mt="1" whiteSpace="pre-wrap">
                          {session.notes}
                        </Text>
                      </Box>
                    )}
                    <Button
                      variant="brand"
                      disabled={!canApprove}
                      loading={approveReview.isPending}
                      onClick={() => void approve()}
                      data-testid="approve-review"
                    >
                      <CheckCircle2 size={15} />
                      {session.status === 'pending'
                        ? `确认修订 rev ${session.currentRevision}`
                        : session.status === 'approved'
                          ? `已确认 rev ${session.approvedRevision}`
                          : '本次确认已失效'}
                    </Button>
                  </Stack>
                </Card.Body>
              </Card.Root>
            </Grid>

            {session.approvedProjectSha256 && session.approvedAssetClosureSha256 && (
              <Box borderTopWidth="1px" borderColor="border" pt="4">
                <Text className="eyebrow">
                  Approved fingerprints · Workbench {session.approvedWorkbenchVersion}
                </Text>
                <Text
                  fontFamily="mono"
                  fontSize="11px"
                  color="ink.muted"
                  mt="2"
                  wordBreak="break-all"
                >
                  project · {session.hashAlgorithm} · {session.approvedProjectSha256}
                </Text>
                <Text
                  fontFamily="mono"
                  fontSize="11px"
                  color="ink.muted"
                  mt="1"
                  wordBreak="break-all"
                >
                  assets · {session.assetHashAlgorithm} · {session.approvedAssetClosureSha256}
                </Text>
                <Text fontSize="11px" color="ink.faint" mt="1">
                  确认时间 {formatDateTime(session.approvedAt)}
                </Text>
              </Box>
            )}
          </Stack>
        </Container>
      </Box>
      <StatusFooter
        revision={session.currentRevision}
        isDirty={false}
        lastSavedAt={project.metadata.updatedAt}
        backendOk
        leftExtras={<Text>review {session.status}</Text>}
      />
    </Flex>
  )
}

function ReviewStatusBadge({ status }: { status: 'pending' | 'approved' | 'stale' }): JSX.Element {
  const config = {
    pending: { label: '等待确认', color: 'state.warn', bg: 'state.warn.muted' },
    approved: { label: '已确认', color: 'state.ok', bg: 'state.ok.muted' },
    stale: { label: '确认已失效', color: 'state.error', bg: 'state.error.muted' },
  }[status]
  return (
    <Badge variant="subtle" color={config.color} bg={config.bg} size="lg">
      {config.label}
    </Badge>
  )
}

function ReviewGuidance({ status }: { status: 'pending' | 'approved' | 'stale' }): JSX.Element {
  const content = {
    pending: {
      type: 'warning' as const,
      title: '确认会锁定当前修订',
      description: '请先在两个编辑器中保存所有手动修复，再回到此页刷新并确认。',
    },
    approved: {
      type: 'success' as const,
      title: '当前修订可以发布',
      description: 'Agent 可使用本次不可变确认生成双产物。',
    },
    stale: {
      type: 'error' as const,
      title: '项目在确认后被修改',
      description: '旧确认保留用于审计，但不能发布。请让 Agent 发起新的校验会话。',
    },
  }[status]
  return (
    <Alert.Root status={content.type} size="sm">
      <Alert.Indicator />
      <Box>
        <Alert.Title fontSize="12px">{content.title}</Alert.Title>
        <Alert.Description fontSize="11px" mt="1">
          {content.description}
        </Alert.Description>
      </Box>
    </Alert.Root>
  )
}

function RevisionLedger({
  openedRevision,
  currentRevision,
  approvedRevision,
  status,
}: {
  openedRevision: number
  currentRevision: number
  approvedRevision?: number
  status: 'pending' | 'approved' | 'stale'
}): JSX.Element {
  return (
    <Stack gap="0">
      <LedgerRow label="开始校验" revision={openedRevision} detail="Agent 发起会话" />
      <Box h="7" borderLeftWidth="1px" borderColor="border.strong" ml="3" />
      {status === 'pending' && (
        <LedgerRow
          label="等待确认的当前版本"
          revision={currentRevision}
          detail={currentRevision !== openedRevision ? '包含工作台手动修复' : undefined}
          active
        />
      )}
      {status === 'approved' && approvedRevision !== undefined && (
        <LedgerRow
          label="批准并锁定"
          revision={approvedRevision}
          detail="发布门禁已解锁"
          approved
        />
      )}
      {status === 'stale' && approvedRevision !== undefined && (
        <>
          <LedgerRow label="曾批准的版本" revision={approvedRevision} detail="旧确认保留用于审计" />
          <Box h="7" borderLeftWidth="1px" borderColor="border.strong" ml="3" />
          <LedgerRow
            label="确认后的当前版本"
            revision={currentRevision}
            detail="项目已变化，需要新建校验会话"
            active
          />
        </>
      )}
    </Stack>
  )
}

function LedgerRow({
  label,
  revision,
  detail,
  active = false,
  approved = false,
}: {
  label: string
  revision: number
  detail?: string
  active?: boolean
  approved?: boolean
}): JSX.Element {
  return (
    <HStack align="center" gap="4">
      <Flex
        minW="7"
        h="7"
        px="2"
        borderRadius="pill"
        align="center"
        justify="center"
        bg={approved ? 'state.ok.muted' : active ? 'brand.muted' : 'bg.sunken'}
        color={approved ? 'state.ok' : active ? 'brand' : 'ink.muted'}
        fontFamily="mono"
        fontSize="10px"
        fontWeight="600"
        flexShrink="0"
      >
        {revision}
      </Flex>
      <Box>
        <Text fontSize="13px" fontWeight="600" color="ink">
          {label}
        </Text>
        {detail && (
          <Text fontSize="11px" color="ink.faint">
            {detail}
          </Text>
        )}
      </Box>
    </HStack>
  )
}

function formatDateTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}
