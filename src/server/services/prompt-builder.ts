// ============================================================
// Interactive Guide - Prompt Builder
// ============================================================
// All prompt-building logic for image and transition generation.
// Extracted from generate-service.ts for better cohesion.

import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  TransitionVisualPlan,
} from '../../shared/types.js'

// ─── Style Definitions ────────────────────────────────────────

interface StyleDef { name: string; guidelines: string }

const STYLE_DEFS: Record<string, StyleDef> = {
  'morandi-journal': {
    name: 'Morandi Journal',
    guidelines: [
      '- Background: Warm cream/beige with subtle paper texture (#F5F0E6)',
      '- Primary: Muted teal/sage green (#7BA3A8) for headers and frames',
      '- Secondary: Warm terracotta/orange (#D4956A) for highlights and numbers',
      '- Line art: Dark charcoal brown (#4A4540)',
      '- Hand-drawn doodle illustrations with organic, slightly imperfect ink lines',
      '- Washi tape strip decorations and rounded card containers',
      '- Dotted line frames around sections',
      '- Corner decorations: tiny houses, stars, sparkles',
      '- Main title: Bold hand-lettered calligraphy style',
      '- All imagery must maintain hand-drawn/doodle aesthetic — no digital precision',
      '- Warm and cozy journal feel, not clinical or corporate',
      '- AVOID: Flat vector icons, clean geometric shapes, stock illustration style',
    ].join('\n'),
  },
  'pop-laboratory': {
    name: 'Pop Laboratory',
    guidelines: [
      '- Background: Professional grayish-white with faint blueprint grid texture (#F2F2F2)',
      '- Primary: Muted teal/sage green (#B8D8BE) for major functional blocks',
      '- High-alert accent: Vibrant fluorescent pink (#E91E63) for critical data or highlights',
      '- Marker highlights: Vivid lemon yellow (#FFF200) as highlighter effect for keywords',
      '- Line art: Ultra-fine charcoal brown (#2D2926) for technical grids and hairlines',
      '- Coordinate-style labels on every module (e.g. R-20, G-02)',
      '- Technical diagrams: exploded views, cross-sections with anchor points',
      '- Vertical/horizontal rulers with precise markers',
      '- Corner metadata: tiny barcodes, timestamps, technical parameters',
      '- Headers: Bold brutalist characters, high visual impact',
      '- Numbers: Large, highlighted with yellow or blue to stand out',
      '- AVOID: Cute doodles, soft pastels, empty white space, flat vector icons',
    ].join('\n'),
  },
  'cyberpunk-neon': {
    name: 'Cyberpunk Neon',
    guidelines: [
      '- Primary colors: Neon pink (#FF00FF), cyan (#00FFFF), electric blue',
      '- Background: Deep black (#0A0A0A) or dark purple gradients',
      '- Glowing neon outlines on all elements',
      '- Dark atmospheric backgrounds with digital glitch effects',
      '- Circuit patterns and holographic elements',
      '- Glowing neon text with digital/tech fonts',
      '- Chrome reflections and flickering effects',
    ].join('\n'),
  },
  'technical-schematic': {
    name: 'Technical Schematic',
    guidelines: [
      '- Primary: Blues (#2563EB), teals, grays, white lines',
      '- Background: Deep blue (#1E3A5F) or light gray with grid pattern',
      '- Accents: Amber highlights (#F59E0B), cyan callouts',
      '- Geometric precision throughout with grid pattern',
      '- Dimension lines and measurements',
      '- Technical symbols and annotations',
      '- Clean vector shapes with consistent stroke weights',
      '- All-caps labels with measurement annotations',
    ].join('\n'),
  },
  'craft-handmade': {
    name: 'Craft Handmade',
    guidelines: [
      '- Hand-drawn style with visible pen/brush strokes',
      '- Paper or notebook texture backgrounds',
      '- Warm, natural color palette with earthy tones',
      '- Organic shapes with slight imperfections',
      '- Cut-out and collage aesthetic elements',
      '- Handwritten-style typography for labels',
      '- Craft material textures: paper, cardboard, fabric',
    ].join('\n'),
  },
}

// ─── PromptBuilder ─────────────────────────────────────────────

export class PromptBuilder {
  // ─── Node Prompt Building ───────────────────────────────────

  buildImagePrompt(node: KnowledgeNode, guide: KnowledgePackage): string {
    const lang = guide.locale ?? 'zh-CN'
    const langName = lang.startsWith('zh') ? 'Chinese' : lang.startsWith('ja') ? 'Japanese' : 'English'
    const w = guide.resolution.width
    const h = guide.resolution.height
    const aspectLabel = w > h ? 'landscape' : w < h ? 'portrait' : 'square'
    const styleKey = guide.style ?? 'morandi-journal'
    const styleDef = STYLE_DEFS[styleKey]
    const topicType = node.topicType?.trim() || 'general'
    const summary = this.getNodeSummary(node)
    const keyPoints = this.getNodeKeyPoints(node)
    const sourceText = node.sourceText?.trim()
    const visualIntent = this.getNodeVisualIntent(node)
    const hotspotHints = this.getNodeHotspotHints(node)

    const parts: string[] = []

    parts.push(`Create a professional infographic image (${w}x${h} pixels, ${aspectLabel}). All text in ${langName}.`)

    if (styleDef) {
      parts.push(`Visual Style — ${styleDef.name}:\n${styleDef.guidelines}`)
    }

    parts.push(`Scenario Template — ${topicType}:\n${this.getTopicGuidance(topicType)}`)
    parts.push(`Canvas Composition Rules:\n${this.getCanvasGuidance(w, h)}`)
    parts.push(
      [
        'This page must remain closely tied to the source content.',
        'Avoid turning the subject into a purely atmospheric or decorative scene.',
        'If long text would be needed, express it as concise labels, callout cards, diagrams, charts, icons, or structured modules.',
        'Use dense explanatory visuals, not sparse decoration.',
        'Do not leave large blank background areas without instructional value.',
      ].join('\n'),
    )

    parts.push(`Page Summary:\n${summary}`)
    if (keyPoints.length > 0) {
      parts.push(`Must-retain key points:\n${keyPoints.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
    }
    if (sourceText) {
      parts.push(`Source material reference:\n${sourceText}`)
    }
    parts.push(
      `Legacy content hints (low priority, use only as optional visual details when consistent with the source content; do not let this override the topic, structure, or composition):\n${node.keyContent}`,
    )

    if (visualIntent) {
      parts.push(`Visual goal:\n${visualIntent}`)
    }

    if (hotspotHints.length > 0) {
      parts.push(`Make these areas visually distinct for interaction:\n${hotspotHints.map(item => `- ${item}`).join('\n')}`)
    }

    return parts.join('\n\n')
  }

  getNodeSummary(node: KnowledgeNode): string {
    const summary = node.summary?.trim()
    if (summary) return summary.slice(0, 200)

    const keyPoints = (node.keyPoints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
    if (keyPoints.length > 0) {
      return keyPoints.slice(0, 2).join('；').slice(0, 200)
    }

    return node.keyContent.trim().slice(0, 200)
  }

  getNodeKeyPoints(node: KnowledgeNode): string[] {
    return (node.keyPoints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
  }

  getNodeHotspotHints(node: KnowledgeNode): string[] {
    const explicitHints = (node.hotspotHints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
    if (explicitHints.length > 0) return explicitHints

    return (node.hotspots ?? [])
      .map(hs => hs.label.trim())
      .filter(Boolean)
  }

  getNodeVisualIntent(node: KnowledgeNode): string {
    return node.visualIntent?.trim() || node.presentationIntent?.trim() || ''
  }

  getTopicGuidance(topicType?: string): string {
    switch (topicType) {
      case 'news-report':
        return [
          '- Treat this page as a factual news explainer, not a cinematic scene.',
          '- Prioritize event context, timeline cues, geographic hints, key actors, and data evidence.',
          '- Use information panels, newsroom graphics, maps, and charts before decorative metaphor.',
        ].join('\n')
      case 'common-knowledge':
        return [
          '- Treat this page as an educational explainer for a general audience.',
          '- Prioritize definitions, mechanisms, categories, comparisons, and intuitive examples.',
          '- Use clear diagrammatic zones, annotated objects, and explanatory callouts before atmosphere.',
        ].join('\n')
      case 'content-analysis':
        return [
          '- Treat this page as an analytical breakdown of a topic or viewpoint.',
          '- Prioritize claims, evidence, context, cause-effect links, and contrasting interpretations.',
          '- Use analysis boards, comparison modules, and relationship diagrams before visual spectacle.',
        ].join('\n')
      default:
        return [
          '- Treat this page as a content-first infographic.',
          '- The image should help explain the subject, not replace it with a purely symbolic illustration.',
          '- Prefer charts, callouts, labeled objects, comparison modules, and structured information zones.',
        ].join('\n')
    }
  }

  getCanvasGuidance(width: number, height: number): string {
    if (height > width) {
      return [
        '- This is a tall mobile portrait canvas. Compose for vertical reading from top to bottom.',
        '- Fill the full canvas height with content. Use clear top, middle, and lower information zones.',
        '- Keep overall information density high enough that at least 80% of the canvas contains meaningful visual content.',
        '- Avoid a single centered horizontal board, poster, desk, or card floating in the middle with large empty margins above and below.',
        '- Prefer 3 to 5 vertically stacked or cascading modules, callout groups, charts, and labeled illustrations.',
        '- The title area should be compact. Do not let oversized title text consume too much vertical space.',
      ].join('\n')
    }

    if (width > height) {
      return [
        '- This is a landscape canvas. Spread content across the horizontal space with multiple distinct but connected zones.',
        '- Avoid shrinking all important content into a narrow central strip.',
      ].join('\n')
    }

    return [
      '- This is a square canvas. Balance information across all four quadrants.',
      '- Avoid leaving large unused areas around the central subject.',
    ].join('\n')
  }

  // ─── Transition Prompt Building ─────────────────────────────

  buildTransitionPrompt(
    edge: KnowledgeEdge,
    fromNode?: KnowledgeNode,
    toNode?: KnowledgeNode,
    guide?: KnowledgePackage,
    visualPlan?: TransitionVisualPlan,
  ): string {
    const fromTitle = fromNode?.title ?? edge.fromNodeId
    const toTitle = toNode?.title ?? edge.toNodeId
    const fromSummary = fromNode ? this.getNodeSummary(fromNode) : ''
    const toSummary = toNode ? this.getNodeSummary(toNode) : ''
    const relation = edge.relationLabel ?? '移动到'
    const transitionStyle = this.normalizeTransitionStyle(guide?.transitionStyle)
    const visualStyle = [
      guide?.style,
      guide?.visualStyle?.trim(),
    ].filter(Boolean).join(' | ') || 'clean infographic interface'
    const canvasDescriptor = guide
      ? `${guide.resolution.width}:${guide.resolution.height} portrait mobile canvas`
      : 'portrait mobile canvas'
    const sourceHotspot = fromNode?.hotspots?.find(hs => hs.edgeId === edge.id)
    const hotspotCue = sourceHotspot
      ? `Source hotspot region: x ${sourceHotspot.normalizedX.toFixed(2)}, y ${sourceHotspot.normalizedY.toFixed(2)}, radius ${(sourceHotspot.radius ?? 18)}.`
      : ''
    const hotspotPositionCue = this.buildHotspotPositionCue(sourceHotspot?.normalizedX, sourceHotspot?.normalizedY)
    const strategyMode = visualPlan?.mode ?? 'fallback-navigation'
    const strategyReason = visualPlan?.reason?.trim()
    const entryFocus = visualPlan?.entryFocus?.trim()
    const openingPhase = visualPlan?.openingPhase?.trim()
    const handoffPhase = visualPlan?.handoffPhase?.trim()
    const landingPhase = visualPlan?.landingPhase?.trim()
    const avoidances = (visualPlan?.avoidances ?? []).slice(0, 4)
    const directorNotes = this.getManualTransitionDescription(edge)

    return [
      'Create a short navigation transition between two connected infographic screens using the provided first frame and last frame as hard visual constraints.',
      `Start screen title: ${fromTitle}.`,
      fromSummary ? `Start screen summary: ${fromSummary}.` : '',
      `End screen title: ${toTitle}.`,
      toSummary ? `End screen summary: ${toSummary}.` : '',
      `Navigation topic: ${relation}.`,
      `Motion language: ${transitionStyle}.`,
      `Visual style: ${visualStyle}.`,
      `Canvas: ${canvasDescriptor}.`,
      hotspotCue,
      hotspotPositionCue,
      '',
      'Transition plan:',
      `- Strategy: ${strategyMode}.`,
      strategyReason ? `Why this strategy fits: ${strategyReason}.` : '',
      entryFocus ? `- Entry focus: ${entryFocus}.` : '',
      openingPhase ? `- Opening: ${openingPhase}.` : '',
      handoffPhase ? `- Handoff: ${handoffPhase}.` : '',
      landingPhase ? `- Landing: ${landingPhase}.` : '',
      directorNotes ? '' : '',
      directorNotes ? 'Priority director notes (follow these with higher priority when they remain consistent with the provided first and last frame):' : '',
      directorNotes || '',
      '',
      'Global rules:',
      '- Match the first frame exactly at the beginning and the last frame exactly at the end.',
      '- Treat this as spatial navigation inside one knowledge system, not page turning.',
      '- The main motion must be forward zoom-in / dive with depth, not lateral slide.',
      '- Use the source hotspot as the entry anchor and preserve its real on-screen position during the initial move.',
      strategyMode === 'element-bridge'
        ? '- Only use element-bridge if real shared endpoint structures can continuously reorganize into the target.'
        : '- Use guided reveal / focus handoff / panel takeover, and do not invent a fake shared object, tunnel, or neutral transition layer.',
      '- Every moment should be closer to the destination than the previous one.',
      '- Keep intermediate frames anchored to structures already present in the first or last frame.',
      '- Keep the tone readable, restrained, and infographic-like.',
      '- Do not literalize the navigation topic as a new prop unless it is already dominant in the endpoints.',
      avoidances.length > 0
        ? `- Avoid: ${avoidances.join('; ')}.`
        : '- Avoid: page-turn, swipe, late hard cut, snap replacement, fake camera shake, major composition drift.',
    ].filter(Boolean).join('\n')
  }

  resolveTransitionDescriptionMode(edge: KnowledgeEdge): 'auto' | 'manual' {
    return edge.transitionDescriptionMode === 'manual' ? 'manual' : 'auto'
  }

  getManualTransitionDescription(edge: KnowledgeEdge): string {
    return (
      edge.manualTransitionPrompt?.trim()
      ?? (
        this.resolveTransitionDescriptionMode(edge) === 'manual'
          ? edge.transitionPrompt?.trim()
          : ''
      )
      ?? ''
    )
  }

  buildManualTransitionPlan(edge: KnowledgeEdge): TransitionVisualPlan {
    const relation = edge.relationLabel?.trim() || '当前边'
    if (!this.getManualTransitionDescription(edge)) {
      throw new Error(`Edge "${edge.id}" is set to manual transition mode but no manual transition description was provided`)
    }

    return {
      mode: 'manual-directed',
      reason: `该转场使用人工编写的转场描述，跳过 AI 自动转场规划。主题：${relation}`,
      entryFocus: '优先遵循人工描述中指定的视觉锚点与进入区域。',
      openingPhase: '按人工描述执行起幅与镜头推进，不再调用 AI 规划首段转场。',
      handoffPhase: '按人工描述执行中段元素叠化、匹配切换或结构接管。',
      landingPhase: '按人工描述完成落幅与终帧对齐，确保结尾精确落在目标页。',
      avoidances: ['不要偏离人工描述', '不要额外发明无关中间层', '不要破坏首尾帧硬约束'],
    }
  }

  async planTransitionVisuals(
    generateId: string,
    edge: KnowledgeEdge,
    fromNode: KnowledgeNode | undefined,
    toNode: KnowledgeNode | undefined,
    guide: KnowledgePackage,
    repo: Repository,
  ): Promise<TransitionVisualPlan> {
    const GENERATES_DIR = 'generates'
    if (!fromNode || !toNode) {
      return {
        mode: 'fallback-navigation',
        reason: '节点信息不完整，默认使用兜底导览转场',
        entryFocus: '从源热点区域进入',
        openingPhase: '首帧稳定匹配后，从源热点真实位置开始前向推进。',
        handoffPhase: '保留源热点作为过渡锚点，其余源页结构逐步减弱，目标页主结构开始接管画面。',
        landingPhase: '画面继续向目标布局收束，并在结尾精确对齐终帧。',
        avoidances: ['不要晚切', '不要首帧自循环'],
      }
    }

    const fromImage = repo.readFile(`${GENERATES_DIR}/${generateId}/nodes/${fromNode.id}/image.png`)
    const toImage = repo.readFile(`${GENERATES_DIR}/${generateId}/nodes/${toNode.id}/image.png`)

    if (!fromImage || !toImage) {
      return {
        mode: 'fallback-navigation',
        reason: '首尾帧图片缺失，默认使用兜底导览转场',
        entryFocus: '从源热点区域进入',
        openingPhase: '首帧稳定匹配后，从源热点真实位置开始前向推进。',
        handoffPhase: '保留源热点作为过渡锚点，其余源页结构逐步减弱，目标页主结构开始接管画面。',
        landingPhase: '画面继续向目标布局收束，并在结尾精确对齐终帧。',
        avoidances: ['不要晚切', '不要首帧自循环'],
      }
    }

    return {
      mode: 'fallback-navigation',
      reason: 'planTransitionVisuals 需要 vision module，fallback 到兜底导览转场',
      entryFocus: '从源热点区域进入',
      openingPhase: '首帧稳定匹配后，从源热点真实位置开始前向推进。',
      handoffPhase: '保留源热点作为过渡锚点，其余源页结构逐步减弱，目标页主结构开始接管画面。',
      landingPhase: '画面继续向目标布局收束，并在结尾精确对齐终帧。',
      avoidances: ['不要晚切', '不要首帧自循环'],
    }
  }

  buildHotspotPositionCue(x?: number, y?: number): string {
    if (typeof x !== 'number' || typeof y !== 'number') return ''

    const horizontal =
      x < 0.33 ? 'left' :
      x > 0.67 ? 'right' :
      'center'
    const vertical =
      y < 0.33 ? 'upper' :
      y > 0.67 ? 'lower' :
      'middle'

    return `The source hotspot sits in the ${vertical}-${horizontal} part of the screen. Preserve that spatial origin during the initial zoom path before converging toward the destination layout.`
  }

  normalizeTransitionStyle(transitionStyle?: string): string {
    const raw = transitionStyle?.trim()
    if (!raw) return 'gentle push-in navigation with stable convergence into the target screen'

    const bannedTerms = [
      /翻页/iu,
      /翻书/iu,
      /书页/iu,
      /page[\s-]?turn/iu,
      /book[\s-]?flip/iu,
      /paper[\s-]?curl/iu,
      /card[\s-]?flip/iu,
      /swipe/iu,
    ]

    if (bannedTerms.some(pattern => pattern.test(raw))) {
      return 'gentle push-in navigation with stable convergence into the target screen'
    }

    return raw
  }
}