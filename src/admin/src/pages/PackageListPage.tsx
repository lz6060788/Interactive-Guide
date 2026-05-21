import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Flex, Text, Button, Heading, Badge, Card, Input,
  IconButton, Spinner, Grid,
} from '@chakra-ui/react'
import { Upload, Play, Download, Copy, Trash2, ChevronRight, Layers, Clock, Plus } from 'lucide-react'
import * as api from '../services/api'
import type { PackageResolution } from '../../../shared/types'

interface GuideListItem {
  id: string
  title: string
  version: string
  resolution: string
  nodeCount: number
  edgeCount: number
  latestBuildStatus?: string
  updatedAt?: string
}

const statusColors: Record<string, string> = {
  success: 'success',
  partial_failed: 'warning',
  failed: 'error',
  running: 'info',
}

const statusLabels: Record<string, string> = {
  success: '成功',
  partial_failed: '部分失败',
  failed: '失败',
  running: '运行中',
}

export function PackageListPage() {
  const navigate = useNavigate()
  const [guides, setGuides] = useState<GuideListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newVersion, setNewVersion] = useState('0.1.0')
  const [newResolution, setNewResolution] = useState<PackageResolution>('16:9')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await api.fetchGuides()
      setGuides(list)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setImporting(true)
      const text = await file.text()
      const data = JSON.parse(text)
      await api.importGuide(data)
      await load()
    } catch (e: any) {
      setError(`导入失败: ${e.message}`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`确认删除知识包 "${id}"？`)) return
    try {
      await api.deleteGuide(id)
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleBuild = async (id: string) => {
    try {
      setBuilding(id)
      await api.startGenerate(id)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBuilding(null)
    }
  }

  const handleExport = async (id: string) => {
    try {
      const guide = await api.fetchGuide(id)
      const blob = new Blob([JSON.stringify(guide, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${id}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleCopy = async (id: string) => {
    try {
      setCopying(id)
      await api.copyGuide(id)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCopying(null)
    }
  }

  const handleCreate = () => {
    setNewTitle('')
    setNewVersion('0.1.0')
    setNewResolution('16:9')
    setShowCreateDialog(true)
  }

  const handleCreateSubmit = async () => {
    if (!newTitle.trim()) return
    try {
      setCreating(true)
      const newGuide = {
        id: `guide_${Date.now()}`,
        title: newTitle.trim(),
        version: newVersion.trim() || '0.1.0',
        resolution: newResolution,
        nodes: [{ id: 'root', title: '首页', keyContent: '待补充', status: 'draft' }],
        edges: [],
      }
      await api.createGuide(newGuide)
      setShowCreateDialog(false)
      navigate(`/guides/${newGuide.id}`)
    } catch (e: any) {
      setError(`创建失败: ${e.message}`)
    } finally {
      setCreating(false)
    }
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
        <Box>
          <Heading size="lg" color="text-primary" fontWeight="700">
            Interactive Guide
          </Heading>
          <Text color="text-secondary" fontSize="sm" mt="1">
            知识包管理
          </Text>
        </Box>
        <Flex gap="3" align="center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/generates')}
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised', color: 'text-primary' }}
          >
            <Clock size={14} style={{ marginRight: 6 }} />
            生成历史
          </Button>
          <Button
            variant="ghost"
            size="sm"
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised', color: 'text-primary' }}
            onClick={handleCreate}
            loading={creating}
          >
            <Plus size={14} style={{ marginRight: 6 }} />
            新建空白包
          </Button>
          <Button
            bg="brand"
            color="white"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={importing}
            _hover={{ bg: 'brand-hover' }}
          >
            <Upload size={14} style={{ marginRight: 6 }} />
            导入 JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </Flex>
      </Flex>

      {/* Content */}
      <Box maxW="1200" mx="auto" px="8" py="6">
        {error && (
          <Box
            bg="error-subtle"
            border="1px solid"
            borderColor="error"
            rounded="md"
            p="3"
            mb="4"
            fontSize="sm"
            color="error"
          >
            {error}
            <Button
              size="xs"
              variant="ghost"
              color="error"
              ml="3"
              onClick={() => setError(null)}
            >
              关闭
            </Button>
          </Box>
        )}

        {loading ? (
          <Flex justify="center" py="20">
            <Spinner color="brand" />
          </Flex>
        ) : guides.length === 0 ? (
          <Box textAlign="center" py="20">
            <Layers size={48} color="var(--chakra-colors-text-tertiary)" style={{ margin: '0 auto 16px' }} />
            <Text color="text-secondary" fontSize="md">暂无知识包</Text>
            <Text color="text-tertiary" fontSize="sm" mt="2">
              点击「导入 JSON」导入一份知识包开始使用
            </Text>
          </Box>
        ) : (
          <Grid templateColumns="repeat(auto-fill, minmax(360px, 1fr))" gap="4">
            {guides.map(guide => (
              <Card.Root
                key={guide.id}
                bg="surface"
                style={{ border: '1px solid #2a2d3a' }}
                _hover={{ style: { border: '1px solid #6366f1' }, shadow: 'md' }}
                transition="all 0.15s"
              >
                <Card.Body p="5">
                  {/* Card header */}
                  <Flex justify="space-between" align="start" mb="2">
                    <Box>
                      <Text fontWeight="600" fontSize="md" color="text-primary">
                        {guide.title}
                      </Text>
                      <Text fontSize="xs" color="text-tertiary" fontFamily="mono">
                        {guide.id}
                      </Text>
                    </Box>
                    <Badge
                      bg="brand-subtle"
                      color="brand"
                      fontSize="xs"
                      px="2"
                      py="0.5"
                      rounded="sm"
                    >
                      v{guide.version}
                    </Badge>
                  </Flex>

                  {/* Meta info */}
                  <Flex gap="4" mb="4">
                    <Text fontSize="xs" color="text-secondary">
                      {guide.resolution}
                    </Text>
                    <Text fontSize="xs" color="text-secondary">
                      {guide.nodeCount} 节点
                    </Text>
                    <Text fontSize="xs" color="text-secondary">
                      {guide.edgeCount} 边
                    </Text>
                    {guide.latestBuildStatus && (
                      <Badge
                        bg={`${statusColors[guide.latestBuildStatus] ?? 'info'}-subtle`}
                        color={statusColors[guide.latestBuildStatus] ?? 'info'}
                        fontSize="xs"
                        px="1.5"
                        py="0.5"
                        rounded="sm"
                      >
                        {statusLabels[guide.latestBuildStatus] ?? guide.latestBuildStatus}
                      </Badge>
                    )}
                  </Flex>

                  {/* Actions */}
                  <Flex gap="2" flexWrap="wrap">
                    <Button
                      size="xs"
                      bg="brand"
                      color="white"
                      _hover={{ bg: 'brand-hover' }}
                      onClick={() => navigate(`/guides/${guide.id}`)}
                    >
                      <ChevronRight size={12} style={{ marginRight: 4 }} />
                      工作台
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      style={{ border: '1px solid #2a2d3a' }}
                      color="text-secondary"
                      _hover={{ bg: 'surface-raised' }}
                      onClick={() => handleBuild(guide.id)}
                      loading={building === guide.id}
                    >
                      <Play size={12} style={{ marginRight: 4 }} />
                      生成
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      style={{ border: '1px solid #2a2d3a' }}
                      color="text-secondary"
                      _hover={{ bg: 'surface-raised' }}
                      onClick={() => handleExport(guide.id)}
                    >
                      <Download size={12} style={{ marginRight: 4 }} />
                      导出
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      style={{ border: '1px solid #2a2d3a' }}
                      color="text-secondary"
                      _hover={{ bg: 'surface-raised' }}
                      onClick={() => handleCopy(guide.id)}
                      loading={copying === guide.id}
                    >
                      <Copy size={12} style={{ marginRight: 4 }} />
                      复制
                    </Button>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      style={{ border: '1px solid #2a2d3a' }}
                      color="error"
                      _hover={{ bg: 'error-subtle' }}
                      onClick={() => handleDelete(guide.id)}
                      aria-label="删除"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </Flex>
                </Card.Body>
              </Card.Root>
            ))}
          </Grid>
        )}
      </Box>

      {/* Create Guide Dialog */}
      {showCreateDialog && (
        <Flex position="fixed" top="0" right="0" bottom="0" left="0" zIndex={200} align="center" justify="center">
          <Box position="fixed" inset="0" bg="blackAlpha.600" onClick={() => setShowCreateDialog(false)} />
          <Box
            position="relative"
            bg="surface"
            rounded="lg"
            p="6"
            w="420px"
            style={{ border: '1px solid #2a2d3a' }}
            zIndex={1}
          >
            <Heading size="sm" mb="4" color="text-primary">新建知识包</Heading>

            <Box mb="4">
              <Text fontSize="xs" color="text-tertiary" mb="1.5">标题 *</Text>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="输入知识包标题"
                style={inputStyle}
              />
            </Box>

            <Box mb="4">
              <Text fontSize="xs" color="text-tertiary" mb="1.5">版本号</Text>
              <input
                type="text"
                value={newVersion}
                onChange={e => setNewVersion(e.target.value)}
                placeholder="0.1.0"
                style={inputStyle}
              />
            </Box>

            <Box mb="4">
              <Text fontSize="xs" color="text-tertiary" mb="1.5">画面比例</Text>
              <select
                value={newResolution}
                onChange={e => setNewResolution(e.target.value)}
                style={inputStyle}
              >
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="375*808">375*808 iPhone 竖屏</option>
              </select>
            </Box>

            <Flex gap="2" justify="flex-end">
              <Button
                size="sm"
                variant="ghost"
                color="text-secondary"
                onClick={() => setShowCreateDialog(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                bg="brand"
                color="white"
                _hover={{ bg: 'brand-hover' }}
                onClick={handleCreateSubmit}
                loading={creating}
                disabled={!newTitle.trim()}
              >
                创建
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0b0f',
  border: '1px solid #2a2d3a',
  borderRadius: '6px',
  color: '#e4e4e7',
  fontSize: '13px',
  padding: '8px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
