// ============================================================
// Interactive Guide - Vision / LLM Service
// ============================================================
// Calls OpenAI-compatible vision models (e.g. kimi-k2.6 via DashScope)
// for node page planning and hotspot recommendation.
// Follows flip-book's callVisionPlanner pattern.

import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedPlannerResult, persistPlannerResult } from './cache.js'
import type { KnowledgeNode, KnowledgePackage, NodeHotspot } from '../../shared/types.js'

// ─── JSON Extraction ─────────────────────────────────────────

function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1)
  return text
}

// ─── Response Types ──────────────────────────────────────────

export interface PlannerResult {
  title: string
  imagePrompt: string
  summary: string
}

export interface HotspotRecommendation {
  targetNodeId: string
  label: string
  normalizedX: number
  normalizedY: number
  radius: number
}

// ─── Node Page Planner ───────────────────────────────────────
// Given a node's keyContent and presentationIntent, produce an image prompt.

const PLANNER_SYSTEM_PROMPT = `你是一个交互式导览信息图编排器。
根据节点的内容描述、呈现意图和交互热点，生成一个用于 AI 图像生成的 prompt。
生成的图像应该是一张信息丰富的信息图/导览页面，且：
- 视觉上突出热点对应的区域，使其容易被识别和点击
- 每个热点区域的内容与目标节点的导航关系匹配
- 整体布局清晰、信息层次分明

如果提供了父节点的参考图和对应的热点标签，当前节点的图像是父图中该元素的放大/细化展示：
- 当前图必须以父图中热点标签对应的元素为核心主体，进行放大、解构或展开细节
- 保持该元素在父图中的视觉特征（形状、配色、材质质感、设计语言）
- 其他辅助元素应服务于主体元素的解读，不引入父图中不存在的新主体元素
- imagePrompt 中必须明确描述从父图继承了哪些视觉元素，以及如何放大/解构这些元素

输出严格 JSON 格式：
{
  "title": "页面标题",
  "imagePrompt": "详细的英文图像生成 prompt，描述信息图的视觉设计、布局、配色、各区域内容及热点标记区域",
  "summary": "页面内容的简短中文摘要（200字以内）"
}`

export async function planNodeImage(node: KnowledgeNode, pkg: KnowledgePackage, parentImageBuffer?: Buffer, parentHotspotLabel?: string): Promise<PlannerResult> {
  const config = loadConfig()

  if (!config.VISION_API_KEY) {
    throw new Error('VISION_API_KEY is not configured — cannot plan node images')
  }

  const hotspotsText = (node.hotspots ?? [])
    .map(hs => `- "${hs.label}" → 跳转到 ${hs.targetNodeId}`)
    .join('\n') || '无'

  let userMessage = `知识包标题：${pkg.title}
视觉风格：${pkg.visualStyle ?? '现代简洁'}
默认分辨率：${pkg.resolution.width}x${pkg.resolution.height}

节点标题：${node.title}
展示意图：${node.presentationIntent ?? '无'}
内容描述：
${node.keyContent}

交互热点（需要在图像中突出显示的可点击区域）：
${hotspotsText}`

  // Build user message content array — include reference image if provided
  const parentImageUrl = parentImageBuffer
    ? `data:image/png;base64,${parentImageBuffer.toString('base64')}`
    : undefined
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: userMessage }]
  if (parentImageUrl) {
    const hotspotContext = parentHotspotLabel
      ? `当前节点是父图中「${parentHotspotLabel}」热点对应的详情页。父图中「${parentHotspotLabel}」区域的视觉元素（形状、配色、材质）必须在当前图中作为核心主体保留并放大、解构。`
      : '请参考此图的视觉风格（色调、布局、设计语言），保持风格延续性。'
    userContent.push(
      { type: 'text', text: '父节点页面图像：' },
      { type: 'image_url', image_url: { url: parentImageUrl } },
      { type: 'text', text: hotspotContext },
    )
  }

  // Check cache
  // Include parent image hash in cache key
  const crypto = await import('node:crypto')
  const parentImageHash = parentImageBuffer
    ? crypto.createHash('sha256').update(parentImageBuffer).digest('hex').slice(0, 16)
    : ''
  const cacheKey = buildCacheKey({ type: 'planner', nodeId: node.id, content: node.keyContent, model: config.VISION_MODEL, parentImageHash, parentHotspotLabel: parentHotspotLabel ?? '' })
  const cached = getCachedPlannerResult(cacheKey)
  if (cached) return cached as PlannerResult

  const response = await fetch(`${config.VISION_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.VISION_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.VISION_MODEL,
      temperature: config.VISION_TEMPERATURE,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: parentImageBuffer ? userContent : userMessage },
      ],
    }),
    signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Vision planner API error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('Vision planner returned empty response')

  const result = JSON.parse(extractJson(content)) as PlannerResult
  persistPlannerResult(cacheKey, result)
  return result
}

// ─── Hotspot Recommender ─────────────────────────────────────
// Given a node image, recommend hotspot positions for its edges.

const HOTSPOT_SYSTEM_PROMPT = `你是一个交互热点推荐器。
根据页面图像和需要标注的交互目标，在图像上推荐热点位置坐标。

坐标系说明：
- normalizedX 和 normalizedY 都是 0 到 1 之间的浮点数
- (0,0) 是左上角，(1,1) 是右下角
- 热点应放在视觉上与目标内容相关的区域

输出严格 JSON 格式：
{
  "hotspots": [
    {
      "targetNodeId": "目标节点ID",
      "label": "热点标签",
      "normalizedX": 0.5,
      "normalizedY": 0.5,
      "radius": 12
    }
  ]
}`

export async function recommendHotspots(
  node: KnowledgeNode,
  imageBuffer: Buffer,
): Promise<HotspotRecommendation[]> {
  const config = loadConfig()

  if (!node.hotspots || node.hotspots.length === 0) return []

  const hotspotTargets = node.hotspots.map(hs => ({
    edgeId: hs.edgeId,
    targetNodeId: hs.targetNodeId,
    label: hs.label,
  }))

  const imageUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`

  const userMessage = `页面标题：${node.title}
需要标注的交互目标：
${JSON.stringify(hotspotTargets, null, 2)}

请根据页面图像，在合适的位置放置热点。`

  const response = await fetch(`${config.VISION_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.VISION_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.VISION_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: HOTSPOT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Hotspot recommendation API error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('Hotspot recommender returned empty response')

  const parsed = JSON.parse(extractJson(content)) as { hotspots: HotspotRecommendation[] }
  return parsed.hotspots ?? []
}
