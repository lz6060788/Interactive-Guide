// ============================================================
// Interactive Guide - Runtime Bundle Generator
// ============================================================
// Generates standalone runtime bundles (HTML/CSS/JS) from a published manifest.
// Extracted from generate-service.ts for better cohesion.

import fs from 'node:fs'
import path from 'node:path'
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

  /** Read the pre-built PlayerCore IIFE bundle. */
  private buildPlayerCoreScript(): string {
    const distPath = path.resolve(
      process.cwd(),
      'src/runtime/player-core/dist/player-core.js',
    )
    if (!fs.existsSync(distPath)) {
      throw AppError.validation(
        'Missing player-core runtime bundle. Run `npm run build:player-core` before packaging.',
      )
    }
    return fs.readFileSync(distPath, 'utf-8')
  }

  private buildRuntimeScript(): string {
    const playerCoreIife = this.buildPlayerCoreScript()

    const glueCode = [
      'const refs = {}',
      'let engine = null',
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
      '  refs.backButton.addEventListener("click", () => engine?.handleBack())',
      '  refs.nodeImage.addEventListener("load", () => {',
      '    updateHotspotViewport()',
      '    requestAnimationFrame(() => {',
      '      confirmHostVisualCommitIfReady("node-image:load:next-frame")',
      '    })',
      '  })',
      '  window.addEventListener("resize", updateHotspotViewport)',
      '  init().catch(error => showError(error instanceof Error ? error.message : String(error)))',
      '})',
      '',
      'async function init() {',
      '  refs.status.textContent = "加载运行时资源..."',
      '  const response = await fetch("./manifest.json", { cache: "no-store" })',
      '  if (!response.ok) throw new Error("无法加载 manifest.json")',
      '  const manifest = await response.json()',
      '',
      '  engine = new PlayerCore({',
      '    container: refs.mediaRoot,',
      '    nodeImage: refs.nodeImage,',
      '    video: refs.video,',
      '  })',
      '',
      '  engine.on("stateChange", render)',
      '  engine.loadManifest(manifest)',
      '',
      '  document.title = `${manifest.title} - Runtime Bundle`',
      '  render()',
      '}',
      '',
      'function toAbsoluteUrl(url) {',
      '  return new URL(url, window.location.href).href',
      '}',
      '',
      'function confirmHostVisualCommitIfReady(reason) {',
      '  if (!engine || engine.isTransitioning()) return',
      '  const currentNode = engine.getCurrentNode()',
      '  if (!currentNode || !refs.nodeImage) return',
      '  const pendingKind = engine.getPendingVisualCommitKind()',
      '  if (pendingKind === "builtin" && reason !== "node-image:load:next-frame") return',
      '  const expectedSrc = toAbsoluteUrl(currentNode.imageUrl)',
      '  const actualSrc = refs.nodeImage.currentSrc || refs.nodeImage.src',
      '  if (!refs.nodeImage.complete || actualSrc !== expectedSrc) return',
      '  engine.confirmHostVisualCommitted()',
      '}',
      '',
      'function render() {',
      '  const manifest = engine.getManifest()',
      '  const currentNode = engine.getCurrentNode()',
      '  if (!manifest || !currentNode) {',
      '    showError("当前节点不存在或 manifest 不完整")',
      '    return',
      '  }',
      '',
      '  const transitioning = engine.isTransitioning()',
      '  const preloading = engine.isPreloading()',
      '',
      '  refs.stage.hidden = preloading',
      '  refs.status.textContent = preloading ? "预加载运行时资源..." : ""',
      '  if (preloading) return',
      '  refs.backButton.disabled = engine.getHistory().length === 0',
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
      '  requestAnimationFrame(() => {',
      '    updateHotspotViewport()',
      '    confirmHostVisualCommitIfReady("render:next-frame")',
      '  })',
      '  refs.hotspots.classList.toggle("hidden", transitioning)',
      '  refs.nodeImage.style.opacity = transitioning ? "0" : "1"',
      '}',
      '',
      'function renderBreadcrumb() {',
      '  const items = engine.buildBreadcrumb()',
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
      '      button.addEventListener("click", () => engine.navigateTo(item.id))',
      '    } else {',
      '      button.disabled = true',
      '    }',
      '    refs.breadcrumb.appendChild(button)',
      '  })',
      '}',
      '',
      'function renderHotspots() {',
      '  const currentNode = engine.getCurrentNode()',
      '  refs.hotspots.innerHTML = ""',
      '  ;(currentNode.hotspots || []).forEach(hotspot => {',
      '    const button = document.createElement("button")',
      '    button.type = "button"',
      '    button.className = "hotspot"',
      '    button.style.left = `${hotspot.normalizedX * 100}%`',
      '    button.style.top = `${hotspot.normalizedY * 100}%`',
      '    button.title = hotspot.label || hotspot.targetNodeId',
      '    button.addEventListener("click", () => engine.handleHotspotClick(hotspot))',
      '    refs.hotspots.appendChild(button)',
      '  })',
      '  requestAnimationFrame(updateHotspotViewport)',
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

    return playerCoreIife + '\n' + glueCode
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
