// ============================================================
// Interactive Guide - Vision / LLM Service
// ============================================================
// Calls OpenAI-compatible vision models (e.g. kimi-k2.6 via DashScope)
// for node page planning and hotspot recommendation.
// Follows flip-book's callVisionPlanner pattern.

import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedPlannerResult, persistPlannerResult } from './cache.js'
import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgePackage,
  NodeHotspot,
  TransitionVisualPlan,
} from '../../shared/types.js'

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

function getNodeSummary(node: KnowledgeNode): string {
  const summary = node.summary?.trim()
  if (summary) return summary.slice(0, 200)

  const keyPoints = (node.keyPoints ?? [])
    .map(item => item.trim())
    .filter(Boolean)
  if (keyPoints.length > 0) return keyPoints.slice(0, 2).join('；').slice(0, 200)

  return node.keyContent.trim().slice(0, 200)
}

function getNodeKeyPoints(node: KnowledgeNode): string[] {
  return (node.keyPoints ?? [])
    .map(item => item.trim())
    .filter(Boolean)
}

function getNodeHotspotHints(node: KnowledgeNode): string[] {
  const explicitHints = (node.hotspotHints ?? [])
    .map(item => item.trim())
    .filter(Boolean)
  if (explicitHints.length > 0) return explicitHints

  return (node.hotspots ?? [])
    .map(hs => hs.label.trim())
    .filter(Boolean)
}

function getNodeVisualIntent(node: KnowledgeNode): string {
  return node.visualIntent?.trim() || node.presentationIntent?.trim() || ''
}

function getTopicGuidance(topicType?: string): string {
  switch (topicType) {
    case 'news-report':
      return '新闻播报型页面，优先事实、时间线、地点、人物、数据证据，避免戏剧化场景渲染。'
    case 'common-knowledge':
      return '常识介绍型页面，优先定义、原理、分类、例子、对比关系，采用解释图而非氛围插画。'
    case 'content-analysis':
      return '内容解读型页面，优先观点、依据、背景、争议点、因果关系，采用分析图而非象征性隐喻。'
    default:
      return '通用内容型页面，优先知识解释与信息结构，避免把主题弱化为纯场景插画。'
  }
}

function getCanvasGuidance(width: number, height: number): string {
  if (height > width) {
    return [
      '这是移动端竖屏长画布，应按从上到下的阅读顺序组织内容。',
      '必须充分使用顶部、中部、下部空间，避免主体只挤在中间一条横向区域。',
      '整体信息密度要高，至少约 80% 的画布应承载有效内容。',
      '避免生成只有一个横向桌板、海报板、卡片或展板悬在中间、上下大面积留白的构图。',
      '优先采用 3 到 5 个纵向堆叠或串联的信息模块、图示、标注卡片和说明区。',
      '标题区应紧凑，不要让超大标题占据过多竖向空间。',
    ].join('\n')
  }

  if (width > height) {
    return [
      '这是横屏画布，应充分利用水平空间展开多个相关信息区。',
      '避免把主要内容压缩到中间狭窄区域。',
    ].join('\n')
  }

  return [
    '这是方形画布，应平衡四个象限的信息分布。',
    '避免中心主体之外出现大面积无效留白。',
  ].join('\n')
}

// ─── Node Page Planner ───────────────────────────────────────
// Given a node's keyContent and presentationIntent, produce an image prompt.

const PLANNER_SYSTEM_PROMPT = `你是一个交互式导览信息图编排器。
根据节点的结构化内容、视觉意图和交互热点，生成一个用于 AI 图像生成的 prompt。
生成的图像应该是一张信息丰富的信息图/导览页面，且：
- 以内容解释为主，视觉为辅，不能退化成与主题弱相关的气氛插画
- 视觉上突出热点对应的区域，使其容易被识别和点击
- 每个热点区域的内容与目标节点的导航关系匹配
- 整体布局清晰、信息层次分明

输出严格 JSON 格式：
{
  "title": "页面标题",
  "imagePrompt": "详细的英文图像生成 prompt，描述信息图的视觉设计、布局、配色、各区域内容及热点标记区域",
  "summary": "页面内容的简短中文摘要（200字以内）"
}`

export async function planNodeImage(node: KnowledgeNode, pkg: KnowledgePackage, _parentImageBuffer?: Buffer, _parentHotspotLabel?: string): Promise<PlannerResult> {
  const config = loadConfig()

  if (!config.VISION_API_KEY) {
    throw new Error('VISION_API_KEY is not configured — cannot plan node images')
  }

  const hotspotsText = (node.hotspots ?? [])
    .map(hs => `- "${hs.label}" → 跳转到 ${hs.targetNodeId}`)
    .join('\n') || '无'
  const keyPoints = getNodeKeyPoints(node)
  const hotspotHints = getNodeHotspotHints(node)
  const visualIntent = getNodeVisualIntent(node)
  const summary = getNodeSummary(node)
  const topicType = node.topicType?.trim() || 'general'

  let userMessage = `知识包标题：${pkg.title}
视觉风格：${pkg.visualStyle ?? '现代简洁'}
默认分辨率：${pkg.resolution.width}x${pkg.resolution.height}
画布构图要求：
${getCanvasGuidance(pkg.resolution.width, pkg.resolution.height)}

节点标题：${node.title}
主题类型：${topicType}
主题说明：${getTopicGuidance(topicType)}
页面摘要：${summary}
视觉意图：${visualIntent || '无'}
核心要点：
${keyPoints.length > 0 ? keyPoints.map((item, index) => `${index + 1}. ${item}`).join('\n') : '无'}

原始内容参考：
${node.sourceText?.trim() || '无'}

兼容旧字段的内容提示（低优先级，仅可作为补充视觉细节，不能覆盖主题、知识结构和构图）：
${node.keyContent}

需要优先做成视觉锚点或说明模块的元素：
${hotspotHints.length > 0 ? hotspotHints.map(item => `- ${item}`).join('\n') : '无'}

交互热点（需要在图像中突出显示的可点击区域）：
${hotspotsText}`

  // Check cache
  const cacheContent = JSON.stringify({
    keyContent: node.keyContent,
    sourceText: node.sourceText ?? '',
    summary,
    keyPoints,
    topicType,
    visualIntent,
    hotspotHints,
  })
  const cacheKey = buildCacheKey({ type: 'planner', nodeId: node.id, content: cacheContent, model: config.VISION_MODEL })
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
        { role: 'user', content: userMessage },
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
根据页面图像和内容描述，在图像上为每个交互目标推荐热点位置坐标。

坐标系说明：
- normalizedX 和 normalizedY 都是 0 到 1 之间的浮点数
- (0,0) 是左上角，(1,1) 是右下角

放置规则（严格遵守）：
1. 热点必须放在图中与该目标内容对应的**视觉元素密集区域的中心**，不能放在空白、纯色背景或装饰性区域
2. 先在图中找到每个目标对应的具体视觉元素（如火箭、卫星、天线、地球、设备图标等），然后将热点放在这些元素的几何中心
3. 不同目标的 X 和 Y 坐标都必须有明显差异：X 至少相差 0.15，Y 至少相差 0.15
4. 绝对禁止将所有热点放在同一条竖线或横线上
5. 如果目标对应的内容分散在图中多个位置，选择最具代表性的那个位置
6. 热点周围需要有足够空间放置圆形标记（约24px直径），不要放在元素边缘

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

  // Build edge context: what does each hotspot lead to?
  const edgeContext = node.hotspots.map(hs =>
    `- "${hs.label}"（目标节点: ${hs.targetNodeId}）`
  ).join('\n')

  const userMessage = `页面标题：${node.title}

图像内容描述：
${node.keyContent}

需要在图中定位的交互热点：
${edgeContext}

操作步骤：
1. 仔细观察图像，找到与每个热点标签对应的视觉元素（图标、插图、文字标签附近区域）
2. 将热点坐标设置在该视觉元素的几何中心
3. 检查所有热点：X 坐标不能全部相同，Y 坐标也不能全部相同
4. 确保热点落在有内容的区域，不落在空白、纯色背景或装饰区域`

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

const TRANSITION_VISUAL_PLAN_SYSTEM_PROMPT = `你是一个导览视频转场视效规划器。
你要根据两张信息图首尾帧，为视频模型输出一份简明但可执行的转场规划。
重点是规划镜头如何从源页进入、如何完成中段接管、如何精确落到目标页，不要堆砌风格辞藻。

可选模式：
- element-bridge：首尾帧存在可连续延展的共享视觉结构，适合局部元素放大、重组、连续变形。
- fallback-navigation：主题相关但视觉骨架不连续，适合导览式揭示，让源页逐步退场、目标页逐步接管。

判定原则：
1. 看源热点局部与目标页主结构是否视觉同构，而不是只看主题词。
2. 如果共享的只是抽象概念词，而不是模块、曲线、容器、图示结构、边框、布局骨架，则优先 fallback-navigation。
3. 如果源热点只是入口提示，不是目标页主视觉的缩略前身，也优先 fallback-navigation。
4. 只有在局部结构、图形语言、布局骨架确实能连续延展时，才选 element-bridge。
5. 如果没有真实共享桥接结构，不要硬造“通道”“隧道”“抽象层”等中性转场层，应直接写 fallback-navigation 的接管方案。

输出严格 JSON：
{
  "mode": "element-bridge 或 fallback-navigation",
  "reason": "一句中文理由",
  "entryFocus": "从首帧哪个局部进入",
  "openingPhase": "前段如何贴合首帧并进入热点",
  "handoffPhase": "中段如何让源页退场并让目标结构接管",
  "landingPhase": "后段如何收束并精确落到终帧",
  "avoidances": ["避免事项1", "避免事项2"]
}`

export async function planTransitionVisuals(
  edge: KnowledgeEdge,
  fromNode: KnowledgeNode,
  toNode: KnowledgeNode,
  pkg: KnowledgePackage,
  fromImageBuffer: Buffer,
  toImageBuffer: Buffer,
): Promise<TransitionVisualPlan> {
  const config = loadConfig()

  if (!config.VISION_API_KEY) {
    throw new Error('VISION_API_KEY is not configured — cannot plan transition visuals')
  }

  const sourceHotspot = fromNode.hotspots?.find(hs => hs.edgeId === edge.id)
  const userMessage = `知识包：${pkg.title}
边ID：${edge.id}
导航语义：${edge.relationLabel ?? '无'}
画布：${pkg.resolution.width}x${pkg.resolution.height}
整体风格：${pkg.style ?? pkg.visualStyle ?? '未指定'}

源节点标题：${fromNode.title}
源节点摘要：${getNodeSummary(fromNode)}
源节点视觉意图：${getNodeVisualIntent(fromNode) || '无'}
源热点位置：${sourceHotspot ? `x=${sourceHotspot.normalizedX.toFixed(2)}, y=${sourceHotspot.normalizedY.toFixed(2)}, r=${sourceHotspot.radius ?? 18}` : '无'}

目标节点标题：${toNode.title}
目标节点摘要：${getNodeSummary(toNode)}
目标节点视觉意图：${getNodeVisualIntent(toNode) || '无'}

请结合两张图像和上述上下文，为这条边输出一份简短但具体的转场规划。
要求：
1. 规划必须体现“前段进入 / 中段接管 / 后段落版”三个阶段。
2. 重点写空间路径和结构接管，不要写空泛的审美形容词。
3. 如果结构不连续，直接选 fallback-navigation，不要强行写元素变形。`

  const cacheKey = buildCacheKey({
    type: 'transition-visual-plan',
    version: 'v2',
    edgeId: edge.id,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    relation: edge.relationLabel ?? '',
    fromSummary: getNodeSummary(fromNode),
    toSummary: getNodeSummary(toNode),
    fromVisualIntent: getNodeVisualIntent(fromNode),
    toVisualIntent: getNodeVisualIntent(toNode),
    hotspot: sourceHotspot
      ? [
        Number(sourceHotspot.normalizedX.toFixed(2)),
        Number(sourceHotspot.normalizedY.toFixed(2)),
        sourceHotspot.radius ?? 18,
      ]
      : null,
  })
  const cached = getCachedPlannerResult(cacheKey)
  if (cached) return cached as TransitionVisualPlan

  const fromImageUrl = `data:image/png;base64,${fromImageBuffer.toString('base64')}`
  const toImageUrl = `data:image/png;base64,${toImageBuffer.toString('base64')}`

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
        { role: 'system', content: TRANSITION_VISUAL_PLAN_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            { type: 'image_url', image_url: { url: fromImageUrl } },
            { type: 'image_url', image_url: { url: toImageUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Transition visual plan API error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('Transition visual plan returned empty response')

  const parsed = JSON.parse(extractJson(content)) as TransitionVisualPlan
  const result: TransitionVisualPlan = {
    mode: parsed.mode === 'fallback-navigation' ? 'fallback-navigation' : 'element-bridge',
    reason: parsed.reason?.trim() || '模型未提供理由',
    entryFocus: parsed.entryFocus?.trim() || '从源热点区域进入',
    openingPhase:
      (parsed as any).openingPhase?.trim() ||
      '首帧保持稳定匹配，从源热点真实位置开始前向推进进入。',
    handoffPhase:
      (parsed as any).handoffPhase?.trim() ||
      [
        (parsed as any).sourceFadePlan?.trim(),
        (parsed as any).midTransitionAction?.trim(),
        (parsed as any).targetRevealPlan?.trim(),
      ].filter(Boolean).join('；') ||
      '源页重点区域保留为过渡锚点，其余结构逐步退场，目标页主要结构分层接管画面。',
    landingPhase:
      (parsed as any).landingPhase?.trim() ||
      (parsed as any).targetRevealPlan?.trim() ||
      '画面继续向目标布局收束，并在结尾精确对齐终帧。',
    avoidances: Array.isArray(parsed.avoidances)
      ? parsed.avoidances.map(item => String(item).trim()).filter(Boolean).slice(0, 6)
      : [],
  }
  persistPlannerResult(cacheKey, result)
  return result
}
