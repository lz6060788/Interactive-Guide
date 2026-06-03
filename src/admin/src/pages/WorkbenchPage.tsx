import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Box, Flex, Text, Button, Heading, Badge, Spinner,
  IconButton,
} from '@chakra-ui/react'
import {
  ArrowLeft, Settings, Play, Eye, Package, Plus,
} from 'lucide-react'
import * as api from '../services/api'
import { layoutWithElk } from '../layout/elk-layout'
import { DetailDrawer } from '../components/DetailDrawer'
import { PreviewModal } from '../components/PreviewModal'
import { HotspotEditorModal } from '../components/HotspotEditorModal'

type SelectedObject =
  | { type: 'package' }
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | null

type SidebarFilter = 'all' | 'failed'

export function WorkbenchPage() {
  const { guideId } = useParams<{ guideId: string }>()
  const navigate = useNavigate()

  const [pkg, setPkg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedObject>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showHotspotEditor, setShowHotspotEditor] = useState(false)
  const [hotspotNodeId, setHotspotNodeId] = useState<string | null>(null)
  const [hotspotEditorNode, setHotspotEditorNode] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [building, setBuilding] = useState(false)
  const [packaging, setPackaging] = useState(false)
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all')
  const [showAddNode, setShowAddNode] = useState(false)
  const [addParentId, setAddParentId] = useState('')
  const [addNodeTitle, setAddNodeTitle] = useState('')

  const load = useCallback(async () => {
    if (!guideId) return
    try {
      setLoading(true)
      const data = await api.fetchGuide(`${guideId}?t=${Date.now()}`)
      setPkg(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [guideId])

  useEffect(() => { load() }, [load])

  const isNodeReady = (n: any) => {
    const nodeKind = n.nodeKind || (n.contentType === 'html' ? 'html' : 'image')
    if (nodeKind === 'html') return !!n.htmlUrl
    if (nodeKind === 'region') {
      const sourceNode = pkg?.nodes?.find((item: any) => item.id === n.regionViewport?.sourceNodeId)
      return !!sourceNode && (sourceNode.imageStatus === 'success' || sourceNode.status === 'success' || !!sourceNode.imageUrl)
    }
    return n.imageStatus === 'success' || n.status === 'success'
  }

  // Build React Flow nodes and edges (position placeholders, ELK will compute layout)
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!pkg) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] }

    const nodeArr: Node[] = pkg.nodes.map((n: any) => {
      const borderColor =
        isNodeReady(n) ? '#22c55e' :
        n.imageStatus === 'failed' || n.status === 'failed' ? '#ef4444' :
        '#2a2d3a'

      return {
        id: n.id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          label: (
            <Box textAlign="center" p="1">
              <Flex align="center" justify="center" gap="1" mb="0.5">
                {n.id === 'root' && (
                  <Badge fontSize="2xs" bg="brand-subtle" color="brand" px="1" rounded="sm">根</Badge>
                )}
                <Text fontWeight="600" fontSize="sm" color="text-primary">
                  {n.title}
                </Text>
              </Flex>
              <Text fontSize="2xs" color="text-tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {n.summary || n.visualIntent || n.presentationIntent || n.id}
              </Text>
              <Flex align="center" justify="center" gap="2" mt="1">
                <Badge
                  fontSize="2xs"
                  px="1"
                  rounded="sm"
                  bg={
                    isNodeReady(n) ? 'success-subtle' :
                    n.imageStatus === 'failed' || n.status === 'failed' ? 'error-subtle' :
                    'surface-overlay'
                  }
                  color={
                    isNodeReady(n) ? 'success' :
                    n.imageStatus === 'failed' || n.status === 'failed' ? 'error' :
                    'text-tertiary'
                  }
                >
                  {isNodeReady(n) ? '就绪' :
                   n.imageStatus === 'failed' || n.status === 'failed' ? '失败' : '待生成'}
                </Badge>
                {n.hotspots?.length > 0 && (
                  <Text fontSize="2xs" color="text-tertiary">
                    {n.hotspots.length} 热点
                  </Text>
                )}
              </Flex>
            </Box>
          ),
        },
        style: {
          background: n.id === 'root' ? 'rgba(99,102,241,0.08)' : '#1a1b23',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '8px',
          padding: '4px 8px',
          minWidth: 180,
        },
      }
    })

    const edgeArr: Edge[] = pkg.edges.map((e: any) => {
      const videoColor =
        e.videoStatus === 'success' || e.status === 'success' ? '#22c55e' :
        e.videoStatus === 'failed' || e.status === 'failed' ? '#ef4444' :
        '#2a2d3a'
      return {
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        label: e.relationLabel || e.id,
        labelStyle: { fontSize: 11, fill: '#8b8fa3' },
        labelBgStyle: { fill: '#0a0b0f', fillOpacity: 0.9 },
        style: { stroke: videoColor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#5c5f77' },
      }
    })

    return { flowNodes: nodeArr, flowEdges: edgeArr }
  }, [pkg])

  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])

  // Apply ELK layout when flowNodes/flowEdges change
  useEffect(() => {
    let cancelled = false
    async function applyLayout() {
      if (flowNodes.length === 0) {
        if (!cancelled) {
          setRfNodes([])
          setRfEdges(flowEdges)
        }
        return
      }
      const layouted = await layoutWithElk(flowNodes, flowEdges)
      if (!cancelled) {
        setRfNodes(layouted)
        setRfEdges(flowEdges)
      }
    }
    applyLayout()
    return () => { cancelled = true }
  }, [flowNodes, flowEdges])

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setRfNodes((nds) => applyNodeChanges(changes, nds)), [],
  )
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setRfEdges((eds) => applyEdgeChanges(changes, eds)), [],
  )

  const handleSave = useCallback(async (data: any) => {
    if (!selected || !pkg || !guideId) return
    try {
      setSaving(true)
      if (selected.type === 'package') {
        await api.updateGuide(guideId, data)
      } else if (selected.type === 'node') {
        await api.updateNode(guideId, selected.id, data)
      } else if (selected.type === 'edge') {
        await api.updateEdge(guideId, selected.id, data)
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [selected, pkg, guideId, load])

  const handleSaveHotspots = useCallback(async (hotspots: any[]) => {
    if (!hotspotNodeId || !guideId) return
    try {
      setSaving(true)
      await api.updateHotspots(guideId, hotspotNodeId, hotspots)
      
      // Update local state without waiting for full reload to avoid flicker
      if (pkg) {
        const updatedNodes = pkg.nodes.map(n => 
          n.id === hotspotNodeId ? { ...n, hotspots } : n
        )
        setPkg({ ...pkg, nodes: updatedNodes })
      }
      
      await load()
      setShowHotspotEditor(false)
      setHotspotEditorNode(null)
      setHotspotNodeId(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [guideId, hotspotNodeId, load, pkg])

  const handleBuild = useCallback(async () => {
    if (!guideId) return
    try {
      setBuilding(true)
      await api.startGenerate(guideId)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBuilding(false)
    }
  }, [guideId])

  const allNodesReady = useMemo(() => {
    if (!pkg?.nodes?.length) return false
    return pkg.nodes.every((node: any) => {
      const nodeKind = node.nodeKind || (node.contentType === 'html' ? 'html' : 'image')
      if (nodeKind === 'html') return !!node.htmlUrl
      if (nodeKind === 'region') {
        const sourceNode = pkg.nodes.find((item: any) => item.id === node.regionViewport?.sourceNodeId)
        return !!sourceNode && (sourceNode.imageStatus === 'success' || sourceNode.status === 'success' || !!sourceNode.imageUrl)
      }
      return node.imageStatus === 'success' || node.status === 'success'
    })
  }, [pkg])

  const packageDisabledReason = useMemo(() => {
    if (building) return '生成进行中，暂不可打包'
    if (packaging) return '打包进行中'
    if (!allNodesReady) return '仅当所有节点均为成功状态时才可打包'
    return ''
  }, [allNodesReady, building, packaging])

  const handlePackage = useCallback(async () => {
    if (!guideId) return
    try {
      setPackaging(true)
      setError(null)
      const bundle = await api.packageGuide(guideId)
      if (!bundle?.entryUrl) {
        throw new Error('打包成功但未返回运行时入口')
      }
      window.open(bundle.entryUrl, '_blank', 'noopener,noreferrer')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPackaging(false)
    }
  }, [guideId, load])

  const openHotspotEditor = useCallback(async (nodeId: string) => {
    if (!guideId) return
    try {
      const manifest = await api.fetchManifest(`${guideId}?t=${Date.now()}`)
      const manifestNode = manifest?.nodeMap?.[nodeId] ?? manifest?.nodes?.find((n: any) => n.id === nodeId)
      if (!manifestNode) {
        throw new Error(`未在 workspace manifest 中找到节点 ${nodeId}`)
      }
      setHotspotEditorNode(manifestNode)
      setHotspotNodeId(nodeId)
      setShowHotspotEditor(true)
    } catch (e: any) {
      setError(e.message)
    }
  }, [guideId])

  const handleAddNode = useCallback(async () => {
    if (!guideId || !addParentId || !addNodeTitle.trim()) return
    try {
      setSaving(true)
      await api.createNode(guideId, {
        parentId: addParentId,
        nodeData: { title: addNodeTitle.trim(), keyContent: '待补充' },
      })
      setShowAddNode(false)
      setAddParentId('')
      setAddNodeTitle('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [guideId, addParentId, addNodeTitle, load])

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (!guideId) return
    try {
      setSaving(true)
      await api.deleteNode(guideId, nodeId)
      setSelected(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [guideId, load])

  const handleRegenerateNode = useCallback(async (nodeId: string) => {
    if (!guideId) return
    try {
      await api.regenerateNode(guideId, nodeId)
      // Poll for completion — reload after a delay
      setTimeout(() => load(), 5000)
    } catch (e: any) {
      setError(e.message)
    }
  }, [guideId, load])

  const handleRegenerateHotspots = useCallback(async (nodeId: string) => {
    if (!guideId) return
    await api.regenerateHotspots(guideId, nodeId)
    await load()
  }, [guideId, load])

  const handleRegenerateEdge = useCallback(async (edgeId: string) => {
    if (!guideId) return
    try {
      await api.regenerateEdge(guideId, edgeId)
      setTimeout(() => load(), 5000)
    } catch (e: any) {
      setError(e.message)
      throw e
    }
  }, [guideId, load])

  // Sidebar filter
  const filteredNodes = useMemo(() => {
    if (!pkg?.nodes) return []
    if (sidebarFilter === 'failed') {
      return pkg.nodes.filter((n: any) => n.imageStatus === 'failed' || n.status === 'failed')
    }
    return pkg.nodes
  }, [pkg, sidebarFilter])

  const filteredEdges = useMemo(() => {
    if (!pkg?.edges) return []
    if (sidebarFilter === 'failed') {
      return pkg.edges.filter((e: any) => e.videoStatus === 'failed' || e.status === 'failed')
    }
    return pkg.edges
  }, [pkg, sidebarFilter])

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="base">
        <Spinner color="brand" />
      </Flex>
    )
  }

  if (!pkg) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="base">
        <Text color="error">知识包不存在</Text>
      </Flex>
    )
  }

  return (
    <Flex direction="column" h="100vh" bg="base">
      {/* Toolbar */}
      <Flex
        align="center"
        gap="4"
        px="5"
        py="3"
        style={{ borderBottom: '1px solid #2a2d3a' }}
        bg="surface"
        flexShrink={0}
      >
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
        <Heading size="sm" fontWeight="600" color="text-primary" flex="1">
          {pkg.title}
        </Heading>
        <Flex gap="2">
          <Button
            size="sm"
            variant="ghost"
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={() => {
              if (pkg?.nodes?.length > 0) setAddParentId(pkg.nodes[0].id)
              setShowAddNode(true)
            }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            新增子节点
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={() => setSelected({ type: 'package' })}
          >
            <Settings size={14} style={{ marginRight: 4 }} />
            配置
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={handleBuild}
            loading={building}
          >
            <Play size={14} style={{ marginRight: 4 }} />
            生成
          </Button>
          <Button
            size="sm"
            bg="brand"
            color="white"
            _hover={{ bg: 'brand-hover' }}
            onClick={() => setShowPreview(true)}
          >
            <Eye size={14} style={{ marginRight: 4 }} />
            预览
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={{ border: '1px solid #2a2d3a' }}
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={handlePackage}
            loading={packaging}
            disabled={Boolean(packageDisabledReason)}
            title={packageDisabledReason || '导出可独立部署的运行时页面'}
          >
            <Package size={14} style={{ marginRight: 4 }} />
            打包
          </Button>
        </Flex>
      </Flex>

      {error && (
        <Box bg="error-subtle" style={{ borderBottom: '1px solid #ef4444' }} px="5" py="2" fontSize="sm" color="error">
          {error}
          <Button size="xs" variant="ghost" color="error" ml="3" onClick={() => setError(null)}>关闭</Button>
        </Box>
      )}

      {/* Main content */}
      <Flex flex="1" overflow="hidden">
        {/* Sidebar */}
        <Box
          w="240px"
          style={{ borderRight: '1px solid #2a2d3a' }}
          bg="surface"
          overflow="auto"
          flexShrink={0}
          p="3"
        >
          {/* Filter tabs */}
          <Flex gap="1" mb="3">
            <Button
              size="xs"
              variant={sidebarFilter === 'all' ? 'solid' : 'ghost'}
              bg={sidebarFilter === 'all' ? 'surface-raised' : 'transparent'}
              color="text-secondary"
              _hover={{ bg: 'surface-raised' }}
              onClick={() => setSidebarFilter('all')}
            >
              全部
            </Button>
            <Button
              size="xs"
              variant={sidebarFilter === 'failed' ? 'solid' : 'ghost'}
              bg={sidebarFilter === 'failed' ? 'error-subtle' : 'transparent'}
              color={sidebarFilter === 'failed' ? 'error' : 'text-secondary'}
              _hover={{ bg: 'surface-raised' }}
              onClick={() => setSidebarFilter('failed')}
            >
              失败
            </Button>
          </Flex>

          {/* Nodes */}
          <Text fontSize="2xs" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="2">
            节点 ({filteredNodes.length})
          </Text>
          {filteredNodes.map((n: any) => (
            <Flex
              key={n.id}
              align="center"
              justify="space-between"
              px="2.5"
              py="1.5"
              rounded="md"
              cursor="pointer"
              mb="0.5"
              bg={selected?.type === 'node' && selected.id === n.id ? 'brand-subtle' : 'transparent'}
              _hover={{ bg: 'surface-raised' }}
              onClick={() => setSelected({ type: 'node', id: n.id })}
            >
              <Text fontSize="xs" color="text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{n.title}</Text>
              <Box
                w="2"
                h="2"
                rounded="full"
                flexShrink={0}
                bg={
                  isNodeReady(n) ? 'success' :
                  n.imageStatus === 'failed' || n.status === 'failed' ? 'error' :
                  n.imageStatus === 'running' ? 'warning' : 'border'
                }
              />
            </Flex>
          ))}

          {/* Edges */}
          <Text fontSize="2xs" color="text-tertiary" textTransform="uppercase" letterSpacing="wider" mb="2" mt="4">
            边 ({filteredEdges.length})
          </Text>
          {filteredEdges.map((e: any) => (
            <Flex
              key={e.id}
              align="center"
              justify="space-between"
              px="2.5"
              py="1.5"
              rounded="md"
              cursor="pointer"
              mb="0.5"
              bg={selected?.type === 'edge' && selected.id === e.id ? 'brand-subtle' : 'transparent'}
              _hover={{ bg: 'surface-raised' }}
              onClick={() => setSelected({ type: 'edge', id: e.id })}
            >
              <Text fontSize="xs" color="text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{e.relationLabel || e.id}</Text>
              <Box
                w="2"
                h="2"
                rounded="full"
                flexShrink={0}
                bg={
                  e.videoStatus === 'success' || e.status === 'success' ? 'success' :
                  e.videoStatus === 'failed' || e.status === 'failed' ? 'error' :
                  e.videoStatus === 'running' ? 'warning' : 'border'
                }
              />
            </Flex>
          ))}
        </Box>

        {/* Canvas */}
        <Box flex="1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_e, node) => setSelected({ type: 'node', id: node.id })}
            onEdgeClick={(_e, edge) => setSelected({ type: 'edge', id: edge.id })}
            fitView
          >
            <Background color="#2a2d3a" gap={16} />
            <Controls style={{ background: '#1a1b23', borderColor: '#2a2d3a' }} />
            <MiniMap
              nodeColor="#252836"
              maskColor="rgba(0,0,0,0.7)"
              style={{ background: '#12131a', borderColor: '#2a2d3a' }}
            />
          </ReactFlow>
        </Box>
      </Flex>

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          pkg={pkg}
          selected={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          saving={saving}
          onOpenHotspotEditor={openHotspotEditor}
          onDeleteNode={handleDeleteNode}
          onRegenerateNode={handleRegenerateNode}
          onRegenerateHotspots={handleRegenerateHotspots}
          onRegenerateEdge={handleRegenerateEdge}
        />
      )}

      {/* Preview Modal */}
      {showPreview && guideId && (
        <PreviewModal
          packageId={guideId}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Hotspot Editor Modal */}
      {showHotspotEditor && hotspotNodeId && hotspotEditorNode && (
        <HotspotEditorModal
          node={hotspotEditorNode}
          packageId={guideId!}
          onClose={() => {
            setShowHotspotEditor(false)
            setHotspotEditorNode(null)
            setHotspotNodeId(null)
          }}
          onSave={handleSaveHotspots}
          saving={saving}
        />
      )}

      {/* Add Child Node Dialog */}
      {showAddNode && (
        <Flex position="fixed" top="0" right="0" bottom="0" left="0" zIndex={200} align="center" justify="center">
          <Box position="fixed" inset="0" bg="blackAlpha.600" onClick={() => setShowAddNode(false)} />
          <Box
            position="relative"
            bg="surface"
            rounded="lg"
            p="6"
            w="400px"
            style={{ border: '1px solid #2a2d3a' }}
            zIndex={1}
          >
            <Heading size="sm" mb="4" color="text-primary">新增子节点</Heading>

            <Box mb="4">
              <Text fontSize="xs" color="text-tertiary" mb="1.5">父节点</Text>
              <select
                value={addParentId}
                onChange={e => setAddParentId(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0a0b0f',
                  border: '1px solid #2a2d3a',
                  borderRadius: '6px',
                  color: '#e4e4e7',
                  fontSize: '13px',
                  padding: '8px 12px',
                  outline: 'none',
                }}
              >
                {pkg?.nodes?.map((n: any) => (
                  <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                ))}
              </select>
            </Box>

            <Box mb="4">
              <Text fontSize="xs" color="text-tertiary" mb="1.5">节点标题</Text>
              <input
                type="text"
                value={addNodeTitle}
                onChange={e => setAddNodeTitle(e.target.value)}
                placeholder="输入节点标题"
                style={{
                  width: '100%',
                  background: '#0a0b0f',
                  border: '1px solid #2a2d3a',
                  borderRadius: '6px',
                  color: '#e4e4e7',
                  fontSize: '13px',
                  padding: '8px 12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </Box>

            <Flex gap="2" justify="flex-end">
              <Button
                size="sm"
                variant="ghost"
                color="text-secondary"
                onClick={() => setShowAddNode(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                bg="brand"
                color="white"
                _hover={{ bg: 'brand-hover' }}
                onClick={handleAddNode}
                loading={saving}
                disabled={!addParentId || !addNodeTitle.trim()}
              >
                创建
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Flex>
  )
}
