// ============================================================
// Interactive Guide - Runtime Bundle Generator
// ============================================================
// Generates standalone runtime bundles (HTML/CSS/JS) from a published manifest.
// Extracted from generate-service.ts for better cohesion.

import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  PublishManifest,
  RuntimeBundlePayload,
} from '../../shared/types.js'
import { nowISO } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'

// ─── RuntimeBundleGenerator ────────────────────────────────────

export class RuntimeBundleGenerator {
  constructor(private repo: Repository) {}

  async buildRuntimeBundle(guideId: string): Promise<RuntimeBundlePayload> {
    const guide = this.repo.loadAllGuides().get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const manifest = this.repo.readJson<PublishManifest>(
      `publish/${guide.id}/${guide.version}/manifest.json`,
    )
    if (!manifest) {
      throw AppError.validation('Guide has no published manifest. Run generate before packaging.')
    }

    const bundleId = `${guide.id}-${Date.now()}`
    const bundleDir = `runtime-bundles/${bundleId}`
    const bundleAssetsDir = `${bundleDir}/assets`
    const bundleNodesDir = `${bundleAssetsDir}/nodes`
    const bundleEdgesDir = `${bundleAssetsDir}/edges`
    const generatedAt = nowISO()

    this.repo.ensureDir(bundleNodesDir)
    this.repo.ensureDir(bundleEdgesDir)

    for (const node of manifest.nodes) {
      const src = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${bundleNodesDir}/${node.id}.png`)
      }
    }

    for (const edge of manifest.edges) {
      const src = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${bundleEdgesDir}/${edge.id}.mp4`)
      }
    }

    const bundledManifest = this.buildRuntimeBundleManifest(guide, manifest)
    this.repo.writeJson(`${bundleDir}/manifest.json`, bundledManifest)

    const payload: RuntimeBundlePayload = {
      bundleId,
      guideId: guide.id,
      version: guide.version,
      generatedAt,
      entryUrl: `/api/runtime-bundles/${bundleId}/index.html`,
      manifestUrl: `/api/runtime-bundles/${bundleId}/manifest.json`,
      bundleUrl: `/api/runtime-bundles/${bundleId}/`,
    }

    this.repo.writeJson(`${bundleDir}/bundle.json`, payload)
    this.repo.writeFile(
      `${bundleDir}/index.html`,
      Buffer.from(this.buildRuntimeIndexHtml(guide.title), 'utf-8'),
    )
    this.repo.writeFile(
      `${bundleDir}/styles.css`,
      Buffer.from(this.buildRuntimeStyles(), 'utf-8'),
    )
    this.repo.writeFile(
      `${bundleDir}/app.js`,
      Buffer.from(this.buildRuntimeScript(), 'utf-8'),
    )

    return payload
  }

  private buildRuntimeBundleManifest(
    guide: KnowledgePackage,
    manifest: PublishManifest,
  ): PublishManifest {
    const nodes = manifest.nodes.map(node => {
      const localImagePath = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (!this.repo.fileExists(localImagePath)) {
        throw AppError.validation(`Missing node asset for standalone bundle: ${node.id}.png`)
      }
      return {
        ...node,
        imageUrl: `./assets/nodes/${node.id}.png`,
      }
    })

    const edges = manifest.edges.map(edge => {
      const localVideoPath = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
      const hasLocalVideo = this.repo.fileExists(localVideoPath)
      if (edge.videoUrl && !hasLocalVideo) {
        throw AppError.validation(`Missing edge asset for standalone bundle: ${edge.id}.mp4`)
      }
      return {
        ...edge,
        videoUrl: hasLocalVideo ? `./assets/edges/${edge.id}.mp4` : undefined,
      }
    })

    const nodeMap: PublishManifest['nodeMap'] = {}
    for (const node of nodes) nodeMap[node.id] = node

    const edgeMap: PublishManifest['edgeMap'] = {}
    for (const edge of edges) edgeMap[edge.id] = edge

    return {
      ...manifest,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        ...manifest.metadata,
        generatedAt: nowISO(),
      },
    }
  }

  private buildRuntimeIndexHtml(title: string): string {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <title>${this.escapeHtml(title)} - Runtime Bundle</title>`,
      '  <link rel="stylesheet" href="./styles.css" />',
      '</head>',
      '<body>',
      '  <div id="app" class="runtime-shell">',
      '    <nav class="runtime-nav" aria-label="面包屑导航">',
      '      <button id="back-button" class="nav-back" type="button">返回</button>',
      '      <div id="breadcrumb" class="breadcrumb"></div>',
      '    </nav>',
      '    <main class="runtime-main">',
      '      <section class="player-shell">',
      '        <div id="status" class="status-text">加载中...</div>',
      '        <div id="stage" class="stage" hidden>',
      '          <div id="media-root" class="media-root">',
      '            <img id="node-image" class="node-image" alt="" />',
      '            <video id="transition-video" class="transition-video" muted playsinline></video>',
      '            <div id="hotspots" class="hotspots"></div>',
      '          </div>',
      '        </div>',
      '      </section>',
      '    </main>',
      '  </div>',
      '  <script src="./app.js" defer></script>',
      '</body>',
      '</html>',
    ].join('\n')
  }

  private buildRuntimeStyles(): string {
    return [
      ':root {',
      '  color-scheme: dark;',
      '  --bg: #08090d;',
      '  --panel: rgba(15, 17, 24, 0.9);',
      '  --panel-border: rgba(255, 255, 255, 0.08);',
      '  --panel-soft: rgba(255, 255, 255, 0.05);',
      '  --text: #f4f4f5;',
      '  --text-soft: rgba(244, 244, 245, 0.68);',
      '  --text-dim: rgba(244, 244, 245, 0.42);',
      '  --shadow: 0 20px 60px rgba(0, 0, 0, 0.4);',
      '}',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; min-height: 100%; background: radial-gradient(circle at top, rgba(53, 60, 92, 0.32) 0%, rgba(8, 9, 13, 1) 46%); color: var(--text); font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; }',
      'button { font: inherit; }',
      '.runtime-shell { min-height: 100vh; display: flex; flex-direction: column; padding: 16px; gap: 12px; }',
      '.runtime-nav, .player-shell { border: 1px solid var(--panel-border); background: var(--panel); backdrop-filter: blur(18px); box-shadow: var(--shadow); }',
      '.runtime-nav { display: flex; align-items: center; gap: 12px; min-height: 60px; border-radius: 18px; padding: 10px 14px; }',
      '.nav-back { flex-shrink: 0; border: 1px solid var(--panel-border); background: transparent; color: var(--text-soft); border-radius: 999px; padding: 8px 14px; cursor: pointer; transition: 160ms ease; }',
      '.nav-back:hover:not(:disabled) { background: var(--panel-soft); color: var(--text); }',
      '.nav-back:disabled { opacity: 0.42; cursor: not-allowed; }',
      '.breadcrumb { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; color: var(--text-soft); font-size: 14px; }',
      '.breadcrumb span { color: var(--text-dim); }',
      '.breadcrumb button { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; max-width: 18rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.breadcrumb button:hover { color: var(--text); }',
      '.breadcrumb button.current { color: var(--text); font-weight: 600; cursor: default; }',
      '.runtime-main { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }',
      '.player-shell { width: 100%; height: 100%; min-height: 0; border-radius: 24px; padding: 16px; display: flex; align-items: center; justify-content: center; }',
      '.status-text { color: var(--text-soft); font-size: 14px; letter-spacing: 0.02em; }',
      '.stage { position: relative; width: min(100%, 1280px); height: min(calc(100vh - 132px), calc(100vw * 1.2)); max-height: 100%; border-radius: 20px; overflow: hidden; background: #020305; }',
      '.media-root { position: relative; width: 100%; height: 100%; }',
      '.node-image, .transition-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }',
      '.transition-video { opacity: 0; pointer-events: none; z-index: 3; }',
      '.transition-video.visible { opacity: 1; }',
      '.hotspots { position: absolute; z-index: 4; pointer-events: none; opacity: 1; transition: opacity 180ms ease; }',
      '.hotspots.hidden { opacity: 0; pointer-events: none; }',
      '.hotspot { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.86); background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98) 0%, rgba(223, 239, 255, 0.96) 36%, rgba(107, 177, 255, 0.84) 70%, rgba(33, 105, 255, 0.46) 100%); box-shadow: 0 0 12px rgba(131, 194, 255, 0.7), 0 0 28px rgba(87, 162, 255, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.88); cursor: pointer; transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease; }',
      '.hotspot { pointer-events: auto; }',
      '.hotspot::before { content: ""; position: absolute; inset: 5px; border-radius: inherit; background: radial-gradient(circle, rgba(255, 255, 255, 0.98) 0%, rgba(214, 238, 255, 0.94) 42%, rgba(148, 206, 255, 0.2) 100%); }',
      '.hotspot::after { content: ""; position: absolute; inset: -8px; border-radius: inherit; background: radial-gradient(circle, rgba(118, 184, 255, 0.55) 0%, rgba(82, 156, 255, 0.28) 45%, rgba(48, 124, 255, 0.08) 72%, rgba(48, 124, 255, 0) 100%); animation: hotspot-pulse 1.9s ease-in-out infinite; }',
      '.hotspot:hover { transform: translate(-50%, -50%) scale(1.18); border-color: rgba(202, 233, 255, 0.98); background: radial-gradient(circle at 35% 35%, rgba(244, 251, 255, 1) 0%, rgba(198, 230, 255, 0.98) 30%, rgba(113, 185, 255, 0.92) 62%, rgba(37, 119, 255, 0.7) 100%); box-shadow: 0 0 18px rgba(137, 208, 255, 0.9), 0 0 40px rgba(95, 176, 255, 0.72), 0 0 72px rgba(49, 128, 255, 0.42), inset 0 0 12px rgba(255, 255, 255, 0.96); }',
      '.hotspot:hover::after { inset: -13px; background: radial-gradient(circle, rgba(158, 214, 255, 0.72) 0%, rgba(110, 186, 255, 0.42) 38%, rgba(58, 137, 255, 0.18) 68%, rgba(58, 137, 255, 0) 100%); }',
      '@keyframes hotspot-pulse { 0%, 100% { transform: scale(0.94); opacity: 0.76; } 50% { transform: scale(1.22); opacity: 0.24; } }',
      '@media (min-width: 1024px) { .runtime-shell { padding: 20px; } .player-shell { padding: 20px; } .stage { height: min(calc(100vh - 152px), 860px); } }',
      '@media (max-width: 767px) { .runtime-shell { padding: 10px; gap: 10px; } .runtime-nav { min-height: 52px; border-radius: 14px; padding: 8px 10px; } .breadcrumb { font-size: 13px; gap: 6px; } .breadcrumb button { max-width: 9rem; } .player-shell { border-radius: 16px; padding: 10px; } .stage { width: 100%; height: min(calc(100vh - 104px), calc(100vw * 1.78)); border-radius: 14px; } .hotspot { width: 24px; height: 24px; } .hotspot::before { inset: 4px; } .hotspot::after { inset: -6px; } .hotspot:hover::after { inset: -10px; } }',
    ].join('\n')
  }

  private buildRuntimeScript(): string {
    return [
      'const state = { manifest: null, currentNodeId: "", history: [], transitioning: false, pendingTransition: null, pendingBuiltinTransition: null }',
      '',
      'const refs = {}',
      '',
      'document.addEventListener("DOMContentLoaded", () => {',
      '  refs.backButton = document.getElementById("back-button")',
      '  refs.breadcrumb = document.getElementById("breadcrumb")',
      '  refs.status = document.getElementById("status")',
      '  refs.stage = document.getElementById("stage")',
      '  refs.mediaRoot = document.getElementById("media-root")',
      '  refs.nodeImage = document.getElementById("node-image")',
      '  refs.hotspots = document.getElementById("hotspots")',
      '  refs.video = document.getElementById("transition-video")',
      '',
      '  refs.backButton.addEventListener("click", handleBack)',
      '  refs.nodeImage.addEventListener("load", updateHotspotViewport)',
      '  window.addEventListener("resize", updateHotspotViewport)',
      '  init().catch(error => showError(error instanceof Error ? error.message : String(error)))',
      '})',
      '',
      'async function init() {',
      '  refs.status.textContent = "加载运行时资源..."',
      '  const response = await fetch("./manifest.json", { cache: "no-store" })',
      '  if (!response.ok) throw new Error("无法加载 manifest.json")',
      '  state.manifest = await response.json()',
      '  state.currentNodeId = state.manifest.rootNodeId',
      '  document.title = `${state.manifest.title} - Runtime Bundle`',
      '  render()',
      '}',
      '',
      'function getCurrentNode() {',
      '  if (!state.manifest) return null',
      '  return state.manifest.nodeMap[state.currentNodeId] || null',
      '}',
      '',
      'function render() {',
      '  const manifest = state.manifest',
      '  const currentNode = getCurrentNode()',
      '  if (!manifest || !currentNode) {',
      '    showError("当前节点不存在或 manifest 不完整")',
      '    return',
      '  }',
      '',
      '  refs.stage.hidden = false',
      '  refs.status.textContent = ""',
      '  refs.backButton.disabled = state.history.length === 0',
      '  refs.nodeImage.src = currentNode.imageUrl',
      '  refs.nodeImage.alt = currentNode.title || currentNode.id',
      '  refs.nodeImage.onerror = () => { refs.status.textContent = "当前节点图片缺失"; refs.stage.hidden = false }',
      '  refs.hotspots.style.left = "0px"',
      '  refs.hotspots.style.top = "0px"',
      '  refs.hotspots.style.width = "100%"',
      '  refs.hotspots.style.height = "100%"',
      '',
      '  renderBreadcrumb()',
      '  renderHotspots()',
      '  requestAnimationFrame(updateHotspotViewport)',
      '  refs.hotspots.classList.toggle("hidden", state.transitioning)',
      '  refs.nodeImage.style.opacity = state.transitioning ? "0" : "1"',
      '  refs.video.classList.toggle("visible", state.transitioning && !state.pendingBuiltinTransition)',
      '  if (!state.transitioning) {',
      '    refs.video.removeAttribute("src")',
      '    refs.video.load()',
      '  }',
      '}',
      '',
      'function renderBreadcrumb() {',
      '  const items = buildBreadcrumb()',
      '  refs.breadcrumb.innerHTML = ""',
      '  items.forEach((item, index) => {',
      '    if (index > 0) {',
      '      const sep = document.createElement("span")',
      '      sep.textContent = "/"',
      '      refs.breadcrumb.appendChild(sep)',
      '    }',
      '    const button = document.createElement("button")',
      '    button.type = "button"',
      '    button.textContent = item.title',
      '    button.className = index === items.length - 1 ? "current" : ""',
      '    if (index < items.length - 1) {',
      '      button.addEventListener("click", () => {',
      '        state.history.push(state.currentNodeId)',
      '        state.currentNodeId = item.id',
      '        state.transitioning = false',
      '        state.pendingTransition = null',
      '        state.pendingBuiltinTransition = null',
      '        render()',
      '      })',
      '    } else {',
      '      button.disabled = true',
      '    }',
      '    refs.breadcrumb.appendChild(button)',
      '  })',
      '}',
      '',
      'function renderHotspots() {',
      '  const currentNode = getCurrentNode()',
      '  refs.hotspots.innerHTML = ""',
      '  ;(currentNode.hotspots || []).forEach(hotspot => {',
      '    const button = document.createElement("button")',
      '    button.type = "button"',
      '    button.className = "hotspot"',
      '    button.style.left = `${hotspot.normalizedX * 100}%`',
      '    button.style.top = `${hotspot.normalizedY * 100}%`',
      '    button.title = hotspot.label || hotspot.targetNodeId',
      '    button.addEventListener("click", () => handleHotspotClick(hotspot))',
      '    refs.hotspots.appendChild(button)',
      '  })',
      '  requestAnimationFrame(updateHotspotViewport)',
      '}',
      '',
      'function handleHotspotClick(hotspot) {',
      '  if (!state.manifest || state.transitioning) return',
      '  const edge = state.manifest.edgeMap[hotspot.edgeId]',
      '  if (!edge) { switchNode(hotspot.targetNodeId); return }',
      '  state.history.push(state.currentNodeId)',
      '',
      '  // Builtin transition',
      '  if (edge.transitionType === "builtin" && edge.builtinTransition) {',
      '    const config = edge.builtinTransition',
      '    // Find the hotspot on the source node to get position',
      '    const fromNode = state.manifest.nodeMap[edge.fromNodeId]',
      '    const hs = fromNode?.hotspots?.find(h => h.targetNodeId === hotspot.targetNodeId)',
      '    if (!hs) { switchNode(hotspot.targetNodeId); return }',
      '    state.transitioning = true',
      '    state.pendingBuiltinTransition = { targetNodeId: hotspot.targetNodeId, config, hotspot: hs }',
      '    render()',
      '    runBuiltinTransition()',
      '    return',
      '  }',
      '',
      '  // Video transition (existing behavior)',
      '  if (edge.videoUrl) {',
      '    state.transitioning = true',
      '    state.pendingTransition = { targetNodeId: hotspot.targetNodeId, videoUrl: edge.videoUrl }',
      '    render()',
      '    playTransition()',
      '    return',
      '  }',
      '',
      '  // No transition or unknown type - immediate switch',
      '  switchNode(hotspot.targetNodeId)',
      '}',
      '',
      'function runBuiltinTransition() {',
      '  if (!state.pendingBuiltinTransition || !refs.mediaRoot) return',
      '  const { targetNodeId, config, hotspot } = state.pendingBuiltinTransition',
      '  const targetNode = state.manifest.nodeMap[targetNodeId]',
      '  if (!targetNode) { switchNode(targetNodeId); return }',
      '',
      '  const container = refs.mediaRoot',
      '  const fromEl = refs.nodeImage.cloneNode(true)',
      '  fromEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;"',
      '',
      '  const toImg = document.createElement("img")',
      '  toImg.src = targetNode.imageUrl',
      '  toImg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;"',
      '',
      '  const transitionContainer = document.createElement("div")',
      '  transitionContainer.style.cssText = "position:absolute;inset:0;z-index:5;overflow:hidden;pointer-events:none;"',
      '  transitionContainer.appendChild(fromEl)',
      '  transitionContainer.appendChild(toImg)',
      '  container.appendChild(transitionContainer)',
      '',
      '  const duration = config.duration || 600',
      '  const easingFn = getEasing(config.easing || "ease-in-out")',
      '  const startTime = performance.now()',
      '',
      '  function animate(currentTime) {',
      '    const elapsed = currentTime - startTime',
      '    const progress = Math.min(elapsed / duration, 1)',
      '    const easedProgress = easingFn(progress)',
      '',
      '    if (config.type === "pan") {',
      '      applyPanTransition(fromEl, toImg, config.direction, easedProgress)',
      '    } else if (config.type === "flip") {',
      '      applyFlipTransition(transitionContainer, fromEl, toImg, config.direction, config.flipStyle || "fade", easedProgress)',
      '    } else if (config.type === "zoom") {',
      '      applyZoomTransition(fromEl, toImg, config.direction, config.scale || 1.5, hotspot, easedProgress)',
      '    }',
      '',
      '    if (progress < 1) {',
      '      requestAnimationFrame(animate)',
      '    } else {',
      '      container.removeChild(transitionContainer)',
      '      switchNode(targetNodeId)',
      '    }',
      '  }',
      '',
      '  toImg.onload = () => requestAnimationFrame(animate)',
      '  toImg.onerror = () => { container.removeChild(transitionContainer); switchNode(targetNodeId) }',
      '}',
      '',
      'function getEasing(easing) {',
      '  switch (easing) {',
      '    case "ease-in": return t => t * t',
      '    case "ease-out": return t => t * (2 - t)',
      '    case "linear": return t => t',
      '    default: return t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t',
      '  }',
      '}',
      '',
      'function applyPanTransition(fromEl, toEl, direction, progress) {',
      '  const w = fromEl.offsetWidth || 800',
      '  const h = fromEl.offsetHeight || 600',
      '  const m = 1',
      '  let fx = 0, fy = 0, tx = 0, ty = 0',
      '  switch (direction) {',
      '    case "left": fx = -w * progress; tx = w * m - w * m * progress; break',
      '    case "right": fx = w * progress; tx = -w * m + w * m * progress; break',
      '    case "up": fy = -h * progress; ty = h * m - h * m * progress; break',
      '    case "down": fy = h * progress; ty = -h * m + h * m * progress; break',
      '  }',
      '  fromEl.style.transform = `translate(${fx}px,${fy}px)`',
      '  toEl.style.transform = `translate(${tx}px,${ty}px)`',
      '}',
      '',
      'function applyFlipTransition(container, fromEl, toEl, direction, flipStyle, progress) {',
      '  const isH = direction === "horizontal"',
      '  const axis = isH ? "Y" : "X"',
      '  const angle = progress * 180',
      '  container.style.perspective = "1000px"',
      '  container.style.transformStyle = "preserve-3d"',
      '  fromEl.style.transformStyle = "preserve-3d"',
      '  fromEl.style.backfaceVisibility = "hidden"',
      '  toEl.style.backfaceVisibility = "hidden"',
      '  fromEl.style.transform = `rotate${axis}(${angle}deg)`',
      '  toEl.style.transform = `rotate${axis}(${-180 + angle}deg)`',
      '}',
      '',
      'function applyZoomTransition(fromEl, toEl, direction, scale, hotspot, progress) {',
      '  const cx = hotspot.normalizedX || 0.5',
      '  const cy = hotspot.normalizedY || 0.5',
      '  fromEl.style.transformOrigin = `${cx * 100}% ${cy * 100}%`',
      '  toEl.style.transformOrigin = `${cx * 100}% ${cy * 100}%`',
      '  let s',
      '  if (direction === "in") {',
      '    s = 1 + (scale - 1) * progress',
      '    fromEl.style.transform = `scale(${s})`',
      '    fromEl.style.opacity = "1"',
      '    toEl.style.opacity = "0"',
      '  } else {',
      '    s = scale - (scale - 1) * progress',
      '    fromEl.style.opacity = "0"',
      '    toEl.style.transform = `scale(${s})`',
      '    toEl.style.opacity = "1"',
      '  }',
      '}',
      '',
      'function playTransition() {',
      '  if (!state.pendingTransition) return',
      '  refs.video.onended = () => switchNode(state.pendingTransition.targetNodeId)',
      '  refs.video.onerror = () => switchNode(state.pendingTransition.targetNodeId)',
      '  refs.video.src = state.pendingTransition.videoUrl',
      '  refs.video.load()',
      '  refs.video.play().catch(() => switchNode(state.pendingTransition.targetNodeId))',
      '}',
      '',
      'function handleBack() {',
      '  if (state.history.length === 0) return',
      '  state.currentNodeId = state.history.pop()',
      '  state.transitioning = false',
      '  state.pendingTransition = null',
      '  state.pendingBuiltinTransition = null',
      '  render()',
      '}',
      '',
      'function switchNode(nodeId) {',
      '  state.currentNodeId = nodeId',
      '  state.transitioning = false',
      '  state.pendingTransition = null',
      '  state.pendingBuiltinTransition = null',
      '  render()',
      '}',
      '',
      'function buildBreadcrumb() {',
      '  if (!state.manifest) return []',
      '  const manifest = state.manifest',
      '  const path = [{ id: state.currentNodeId, title: manifest.nodeMap[state.currentNodeId]?.title || state.currentNodeId }]',
      '  let cursor = state.currentNodeId',
      '  while (cursor !== manifest.rootNodeId) {',
      '    const edge = manifest.edges.find(item => item.toNodeId === cursor)',
      '    if (!edge) break',
      '    cursor = edge.fromNodeId',
      '    path.unshift({ id: cursor, title: manifest.nodeMap[cursor]?.title || cursor })',
      '  }',
      '  return path',
      '}',
      '',
      'function updateHotspotViewport() {',
      '  if (!refs.mediaRoot || !refs.nodeImage || refs.stage.hidden) return',
      '  const mediaRect = refs.mediaRoot.getBoundingClientRect()',
      '  const imageRect = refs.nodeImage.getBoundingClientRect()',
      '  if (!mediaRect.width || !mediaRect.height || !imageRect.width || !imageRect.height) return',
      '  refs.hotspots.style.left = `${imageRect.left - mediaRect.left}px`',
      '  refs.hotspots.style.top = `${imageRect.top - mediaRect.top}px`',
      '  refs.hotspots.style.width = `${imageRect.width}px`',
      '  refs.hotspots.style.height = `${imageRect.height}px`',
      '}',
      '',
      'function showError(message) {',
      '  refs.stage.hidden = true',
      '  refs.status.textContent = message',
      '}',
    ].join('\n')
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
