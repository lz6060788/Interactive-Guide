import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from 'reactflow'

const elk = new ELK()

const NODE_WIDTH = 200
const NODE_HEIGHT = 80

export async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  if (nodes.length === 0) return nodes

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
    },
    children: nodes.map(n => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const layouted = await elk.layout(graph)

  const positionMap = new Map<string, { x: number; y: number }>()
  for (const child of layouted.children ?? []) {
    positionMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  return nodes.map(n => {
    const pos = positionMap.get(n.id)
    return {
      ...n,
      position: pos ?? n.position,
    }
  })
}
