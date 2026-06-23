import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Flex, Text, Button, Heading, Badge, Spinner,
} from '@chakra-ui/react'
import { ArrowLeft, RefreshCw, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import * as api from '../services/api'

interface GenerateRecord {
  buildId: string
  packageId: string
  packageVersion: string
  status: string
  currentStage: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  summary: {
    nodeTotal: number
    nodeSuccess: number
    hotspotTotal: number
    hotspotReady: number
    edgeTotal: number
    edgeSuccess: number
  }
}

const statusColors: Record<string, string> = {
  success: 'success',
  partial_failed: 'warning',
  failed: 'error',
  running: 'info',
  cancelled: 'text-tertiary',
}

const statusLabels: Record<string, string> = {
  success: '成功',
  partial_failed: '部分失败',
  failed: '失败',
  running: '运行中',
  cancelled: '已取消',
}

const stageLabels: Record<string, string> = {
  validate: '校验',
  prepare: '准备',
  gen_nodes: '生成节点',
  gen_hotspots: '生成热点',
  gen_edges: '生成边',
  publish: '发布',
  done: '完成',
}

export function GenerateHistoryPage() {
  const navigate = useNavigate()
  const [generates, setGenerates] = useState<GenerateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string[]>>({})

  const load = async () => {
    try {
      setLoading(true)
      const list = await api.fetchGenerates()
      setGenerates(list)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!logs[id]) {
      try {
        const logData = await api.fetchGenerateLogs(id)
        setLogs(prev => ({ ...prev, [id]: logData }))
      } catch (e: any) {
        setLogs(prev => ({ ...prev, [id]: [`加载日志失败: ${e.message}`] }))
      }
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const duration = (record: GenerateRecord) => {
    if (!record.startedAt || !record.finishedAt) return '-'
    const ms = new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime()
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <Box minH="100vh" bg="base">
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        px="8"
        py="5"
        style={{ borderBottom: '1px solid #2a2d3a' }}
        bg="surface"
      >
        <Flex align="center" gap="4">
          <Button
            variant="ghost"
            size="sm"
            color="text-secondary"
            _hover={{ color: 'text-primary', bg: 'surface-raised' }}
            onClick={() => navigate('/guides')}
          >
            <ArrowLeft size={16} style={{ marginRight: 4 }} />
            返回
          </Button>
          <Heading size="md" color="text-primary" fontWeight="600">
            生成任务历史
          </Heading>
        </Flex>
        <Button
          variant="ghost"
          size="sm"
          style={{ border: '1px solid #2a2d3a' }}
          color="text-secondary"
          _hover={{ bg: 'surface-raised' }}
          onClick={load}
          loading={loading}
        >
          <RefreshCw size={14} style={{ marginRight: 6 }} />
          刷新
        </Button>
      </Flex>

      {/* Content */}
      <Box maxW="1200" mx="auto" px="8" py="6">
        {error && (
          <Box bg="error-subtle" border="1px solid" borderColor="error" rounded="md" p="3" mb="4" fontSize="sm" color="error">
            {error}
          </Box>
        )}

        {loading ? (
          <Flex justify="center" py="20">
            <Spinner color="brand" />
          </Flex>
        ) : generates.length === 0 ? (
          <Box textAlign="center" py="20">
            <FileText size={48} color="var(--chakra-colors-text-tertiary)" style={{ margin: '0 auto 16px' }} />
            <Text color="text-secondary">暂无生成记录</Text>
          </Box>
        ) : (
          <Box>
            {generates.map(record => (
              <Box key={record.buildId} mb="3" style={{ border: '1px solid #2a2d3a' }} rounded="md" bg="surface">
                {/* Row */}
                <Flex
                  align="center"
                  px="4"
                  py="3"
                  gap="4"
                  cursor="pointer"
                  _hover={{ bg: 'surface-raised' }}
                  onClick={() => toggleExpand(record.buildId)}
                >
                  <Box color="text-tertiary" flexShrink={0}>
                    {expandedId === record.buildId ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </Box>

                  <Box flex="1" minW="0">
                    <Flex align="center" gap="2">
                      <Text fontWeight="500" fontSize="sm" color="text-primary">
                        {record.packageId}
                      </Text>
                      <Badge
                        bg={`${statusColors[record.status] ?? 'info'}-subtle`}
                        color={statusColors[record.status] ?? 'info'}
                        fontSize="xs"
                        px="1.5"
                        py="0.5"
                        rounded="sm"
                      >
                        {statusLabels[record.status] ?? record.status}
                      </Badge>
                    </Flex>
                    <Text fontSize="xs" color="text-tertiary" fontFamily="mono">
                      {record.buildId}
                    </Text>
                  </Box>

                  <Flex gap="6" align="center" flexShrink={0}>
                    <Text fontSize="xs" color="text-secondary">
                      节点 {record.summary.nodeSuccess}/{record.summary.nodeTotal}
                    </Text>
                    <Text fontSize="xs" color="text-secondary">
                      边 {record.summary.edgeSuccess}/{record.summary.edgeTotal}
                    </Text>
                    <Text fontSize="xs" color="text-secondary">
                      {stageLabels[record.currentStage] ?? record.currentStage}
                    </Text>
                    <Text fontSize="xs" color="text-tertiary">
                      {duration(record)}
                    </Text>
                    <Text fontSize="xs" color="text-tertiary">
                      {formatDate(record.createdAt)}
                    </Text>
                  </Flex>
                </Flex>

                {/* Expanded logs */}
                {expandedId === record.buildId && (
                  <Box
                    style={{ borderTop: '1px solid #2a2d3a' }}
                    bg="base"
                    p="4"
                    maxH="300px"
                    overflowY="auto"
                    fontFamily="mono"
                    fontSize="xs"
                    color="text-secondary"
                    whiteSpace="pre-wrap"
                  >
                    {logs[record.buildId] ? (
                      logs[record.buildId].map((line, i) => (
                        <Box key={i} py="0.5" _hover={{ bg: 'surface-raised' }}>
                          {line}
                        </Box>
                      ))
                    ) : (
                      <Spinner size="sm" color="brand" />
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
