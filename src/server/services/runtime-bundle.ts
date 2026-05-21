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

    let manifest = this.repo.readJson<PublishManifest>(
      `publish/${guide.id}/${guide.version}/manifest.json`,
    )

    let workspaceFallback = false
    if (!manifest) {
      manifest = this.buildManifestFromWorkspace(guide)
      workspaceFallback = true
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
      if (node.contentType === 'html') {
        const src = workspaceFallback
          ? `workspace/${guide.id}/nodes/${node.id}.html`
          : `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.html`
        if (this.repo.fileExists(src)) {
          this.repo.copyFile(src, `${bundleNodesDir}/${node.id}.html`)
        }
      } else {
        const src = workspaceFallback
          ? `workspace/${guide.id}/nodes/${node.id}.png`
          : `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
        if (this.repo.fileExists(src)) {
          this.repo.copyFile(src, `${bundleNodesDir}/${node.id}.png`)
        }
      }
    }

    for (const edge of manifest.edges) {
      const src = workspaceFallback
        ? `workspace/${guide.id}/edges/${edge.id}.mp4`
        : `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${bundleEdgesDir}/${edge.id}.mp4`)
      }
    }

    const bundledManifest = this.buildRuntimeBundleManifest(guide, manifest, workspaceFallback)
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
    workspaceFallback: boolean = false,
  ): PublishManifest {
    const nodes = manifest.nodes.map(node => {
      if (node.contentType === 'html') {
        const localHtmlPath = workspaceFallback
          ? `workspace/${guide.id}/nodes/${node.id}.html`
          : `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.html`
        if (!this.repo.fileExists(localHtmlPath)) {
          throw AppError.validation(`Missing HTML asset for standalone bundle: ${node.id}.html`)
        }
        return {
          ...node,
          contentType: 'html' as const,
          htmlUrl: `./assets/nodes/${node.id}.html`,
          imageUrl: undefined,
        }
      }

      const localImagePath = workspaceFallback
        ? `workspace/${guide.id}/nodes/${node.id}.png`
        : `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (!this.repo.fileExists(localImagePath)) {
        throw AppError.validation(`Missing node asset for standalone bundle: ${node.id}.png`)
      }
      return {
        ...node,
        imageUrl: `./assets/nodes/${node.id}.png`,
      }
    })

    const edges = manifest.edges.map(edge => {
      const localVideoPath = workspaceFallback
        ? `workspace/${guide.id}/edges/${edge.id}.mp4`
        : `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
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


  private buildManifestFromWorkspace(guide: KnowledgePackage): PublishManifest {
    const mediaBase = `/api/media/workspace/${guide.id}`

    const nodes = guide.nodes.map(n => {
      if (n.contentType === 'html') {
        return {
          id: n.id,
          title: n.title,
          contentType: 'html' as const,
          htmlUrl: `${mediaBase}/nodes/${n.id}.html`,
          hotspotEdgeIds: n.hotspotEdgeIds,
          imageFitMode: n.imageFitMode,
          hotspots: (n.hotspots ?? []).map(hs => ({
            edgeId: hs.edgeId,
            targetNodeId: hs.targetNodeId,
            label: hs.label,
            normalizedX: hs.normalizedX,
            normalizedY: hs.normalizedY,
            radius: hs.radius,
            markerType: 'dot' as const,
          })),
        }
      }
      return {
        id: n.id,
        title: n.title,
        imageUrl: `${mediaBase}/nodes/${n.id}.png`,
        imageFitMode: n.imageFitMode,
        hotspots: (n.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot' as const,
        })),
      }
    })

    const edges = guide.edges.map(e => {
      const videoPath = `workspace/${guide.id}/edges/${e.id}.mp4`
      const hasVideo = this.repo.fileExists(videoPath)
      return {
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        relationLabel: e.relationLabel,
        videoUrl: hasVideo ? `${mediaBase}/edges/${e.id}.mp4` : undefined,
      }
    })

    const nodeMap: PublishManifest['nodeMap'] = {}
    for (const node of nodes) nodeMap[node.id] = node

    const edgeMap: PublishManifest['edgeMap'] = {}
    for (const edge of edges) edgeMap[edge.id] = edge

    return {
      packageId: guide.id,
      version: guide.version,
      title: guide.title,
      rootNodeId: 'root',
      resolution: guide.resolution,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        generatedAt: nowISO(),
        manifestVersion: '1.0.0',
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
      '    <button id="back-button" class="nav-back" type="button" style="display:none;">&#8592;</button>',
      '    <main class="runtime-main">',
      '      <div id="stage" class="stage" hidden>',
      '        <div id="media-root" class="media-root">',
      '          <img id="node-image" class="node-image" alt="" />',
      '          <iframe id="node-iframe" class="node-iframe" sandbox="allow-scripts allow-same-origin" style="display:none;"></iframe>',
      '          <video id="transition-video" class="transition-video" muted playsinline></video>',
      '          <div id="hotspots" class="hotspots"></div>',
      '        </div>',
      '      </div>',
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
      '  --text: #f4f4f5;',
      '  --text-soft: rgba(244, 244, 245, 0.68);',
      '}',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; min-height: 100%; background: #000; color: var(--text); font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; }',
      'button { font: inherit; }',
      '.runtime-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 0; background: #000; }',
      '.nav-back { position: fixed; top: 16px; left: 16px; z-index: 10; border: none; background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.8); border-radius: 999px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; transition: background 160ms ease; }',
      '.nav-back:hover { background: rgba(0,0,0,0.8); color: #fff; }',
      '.runtime-main { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }',
      '.stage { position: relative; overflow: hidden; background: #000; max-width: 100%; max-height: 100%; }',
      '.media-root { position: relative; width: 100%; height: 100%; }',
      '.node-image, .transition-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }',
      '.node-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: #000; }',
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
      '.node-image-fill { object-fit: fill; }',
      '.node-image-fit-height { position: absolute; left: 50%; top: 50%; height: 100% !important; width: auto !important; max-width: none; max-height: none; cursor: grab; transform: translate(-50%, -50%); }',
      '.node-image-fit-width { position: absolute; left: 50%; top: 50%; width: 100% !important; height: auto !important; max-width: none; max-height: none; cursor: grab; transform: translate(-50%, -50%); }',
      '.media-root-fit { overflow: hidden; }',
      '@media (max-width: 767px) { .hotspot { width: 24px; height: 24px; } .hotspot::before { inset: 4px; } .hotspot::after { inset: -6px; } .hotspot:hover::after { inset: -10px; } }',
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
      'let dragState = { active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 }',
      'let imageOffset = { x: 0, y: 0 }',
      '',
      'document.addEventListener("DOMContentLoaded", () => {',
      '  refs.backButton = document.getElementById("back-button")',
      '  refs.stage = document.getElementById("stage")',
      '  refs.mediaRoot = document.getElementById("media-root")',
      '  refs.nodeImage = document.getElementById("node-image")',
      '  refs.nodeIframe = document.getElementById("node-iframe")',
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
      '  refs.nodeIframe.addEventListener("load", () => {',
      '    requestAnimationFrame(() => {',
      '      confirmHostVisualCommitIfReady("node-iframe:load:next-frame")',
      '    })',
      '  })',
      '  window.addEventListener("message", (event) => {',
      '    if (event.data?.type === "hotspot-click" && event.data?.edgeId) {',
      '      engine?.handleHotspotById(event.data.edgeId)',
      '    }',
      '  })',
      '  window.addEventListener("resize", updateHotspotViewport)',
      '',
      '  // Drag handlers for fitHeight/fitWidth modes',
      '  refs.nodeImage.addEventListener("mousedown", (e) => {',
      '    const currentNode = engine?.getCurrentNode()',
      '    if (!currentNode) return',
      '    const fitMode = currentNode.imageFitMode || "fill"',
      '    if (fitMode === "fill") return',
      '    e.preventDefault()',
      '    dragState = { active: true, startX: e.clientX, startY: e.clientY, startOffsetX: imageOffset.x, startOffsetY: imageOffset.y }',
      '    document.addEventListener("mousemove", handleDragMove)',
      '    document.addEventListener("mouseup", handleDragEnd)',
      '  })',
      '',
      '  init().catch(error => { console.error(error); })',
      '})',
      '',
      'function applyImageTransform(offsetX, offsetY) {',
      '  const currentNode = engine?.getCurrentNode()',
      '  const fitMode = currentNode?.imageFitMode || "fill"',
      '  const nextX = fitMode === "fitHeight" ? offsetX : 0',
      '  const nextY = fitMode === "fitWidth" ? offsetY : 0',
      '  imageOffset = { x: nextX, y: nextY }',
      '  refs.nodeImage.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`',
      '}',
      '',
      'function handleDragMove(e) {',
      '  if (!dragState.active) return',
      '  const cRect = refs.mediaRoot.getBoundingClientRect()',
      '  const iRect = refs.nodeImage.getBoundingClientRect()',
      '  const currentNode = engine?.getCurrentNode()',
      '  const fitMode = currentNode?.imageFitMode || "fill"',
      '  let nextX = dragState.startOffsetX',
      '  let nextY = dragState.startOffsetY',
      '  if (fitMode === "fitHeight") {',
      '    nextX += e.clientX - dragState.startX',
      '    if (iRect.width > cRect.width) {',
      '      const maxOffsetX = (iRect.width - cRect.width) / 2',
      '      nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX))',
      '    } else {',
      '      nextX = 0',
      '    }',
      '    nextY = 0',
      '  } else if (fitMode === "fitWidth") {',
      '    nextY += e.clientY - dragState.startY',
      '    if (iRect.height > cRect.height) {',
      '      const maxOffsetY = (iRect.height - cRect.height) / 2',
      '      nextY = Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY))',
      '    } else {',
      '      nextY = 0',
      '    }',
      '    nextX = 0',
      '  }',
      '  applyImageTransform(nextX, nextY)',
      '  requestAnimationFrame(updateHotspotViewport)',
      '}',
      '',
      'function handleDragEnd() {',
      '  dragState.active = false',
      '  document.removeEventListener("mousemove", handleDragMove)',
      '  document.removeEventListener("mouseup", handleDragEnd)',
      '}',
      '',
      'async function init() {',
      '  const response = await fetch("./manifest.json", { cache: "no-store" })',
      '  if (!response.ok) throw new Error("无法加载 manifest.json")',
      '  const manifest = await response.json()',
      '',
      '  // Set stage size based on resolution — fit into 90vw x 90vh keeping aspect ratio',
      '  const parts = manifest.resolution.split(":").map(Number)',
      '  const ar = parts[0] / parts[1]',
      '  refs.stage.style.aspectRatio = manifest.resolution.replace(":", " / ")',
      '  refs.stage.style.width = `min(90vw, 90vh * ${ar})`',
      '  refs.stage.style.height = `min(90vh, 90vw / ${ar})`',
      '',
      '  engine = new PlayerCore({',
      '    container: refs.mediaRoot,',
      '    nodeImage: refs.nodeImage,',
      '    video: refs.video,',
      '    nodeIframe: refs.nodeIframe,',
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
      'function captureElementVisualSnapshot(el) {',
      '  if (!el) return null',
      '  const rect = el.getBoundingClientRect()',
      '  const style = window.getComputedStyle(el)',
      '  return {',
      '    rect: {',
      '      x: Number(rect.x.toFixed(2)),',
      '      y: Number(rect.y.toFixed(2)),',
      '      width: Number(rect.width.toFixed(2)),',
      '      height: Number(rect.height.toFixed(2)),',
      '    },',
      '    style: {',
      '      width: style.width,',
      '      height: style.height,',
      '      display: style.display,',
      '      objectFit: style.objectFit,',
      '      objectPosition: style.objectPosition,',
      '      transform: style.transform,',
      '      transformOrigin: style.transformOrigin,',
      '      opacity: style.opacity,',
      '      borderRadius: style.borderRadius,',
      '    },',
      '  }',
      '}',
      '',
      'function confirmHostVisualCommitIfReady(reason) {',
      '  if (!engine) return',
      '  const currentNode = engine.getCurrentNode()',
      '  if (!currentNode) return',
      '  const pendingKind = engine.getPendingVisualCommitKind()',
      '  if (engine.isTransitioning() && !pendingKind) return',
      '  if (pendingKind === "builtin" && reason !== "node-image:load:next-frame") return',
      '',
      '  if (currentNode.contentType === "html") {',
      '    if (!refs.nodeIframe) return',
      '    const expectedSrc = toAbsoluteUrl(currentNode.htmlUrl)',
      '    const actualSrc = refs.nodeIframe.src',
      '    if (actualSrc !== expectedSrc) return',
      '  } else {',
      '    if (!refs.nodeImage) return',
      '    const expectedSrc = toAbsoluteUrl(currentNode.imageUrl)',
      '    const actualSrc = refs.nodeImage.currentSrc || refs.nodeImage.src',
      '    if (!refs.nodeImage.complete || actualSrc !== expectedSrc) return',
      '    if (pendingKind === "builtin") {',
      '      const frozenFrame = refs.mediaRoot.querySelector(\'[data-builtin-frozen-frame="true"]\')',
      '      console.log("[RuntimeBundle][builtin-handoff]", {',
      '        reason,',
      '        currentNodeId: engine.getCurrentNodeId(),',
      '        expectedSrc,',
      '        actualSrc,',
      '        frozenFrame: captureElementVisualSnapshot(frozenFrame),',
      '        nodeImage: captureElementVisualSnapshot(refs.nodeImage),',
      '      })',
      '    }',
      '  }',
      '  engine.confirmHostVisualCommitted()',
      '}',
      '',
      'function render() {',
      '  const manifest = engine.getManifest()',
      '  const currentNode = engine.getCurrentNode()',
      '  if (!manifest || !currentNode) return',
      '',
      '  const transitioning = engine.isTransitioning()',
      '  const preloading = engine.isPreloading()',
      '  const isHtml = currentNode.contentType === "html"',
      '  const fitMode = currentNode.imageFitMode || "fill"',
      '',
      '  refs.stage.hidden = preloading',
      '  if (preloading) return',
      '',
      '  // Back button visibility',
      '  refs.backButton.style.display = engine.getHistory().length > 0 ? "flex" : "none"',
      '',
      '  if (isHtml) {',
      '    refs.nodeImage.style.display = "none"',
      '    refs.nodeIframe.style.display = "block"',
      '    refs.nodeIframe.src = currentNode.htmlUrl',
      '    refs.hotspots.classList.add("hidden")',
      '  } else {',
      '    refs.nodeImage.style.display = "block"',
      '    refs.nodeIframe.style.display = "none"',
      '    refs.nodeIframe.src = "about:blank"',
      '    refs.nodeImage.src = currentNode.imageUrl',
      '    refs.nodeImage.alt = currentNode.title || currentNode.id',
      '',
      '    // Apply image fit mode classes',
      '    refs.nodeImage.classList.remove("node-image-fill", "node-image-fit-height", "node-image-fit-width")',
      '    refs.mediaRoot.classList.remove("media-root-fit")',
      '    refs.nodeImage.style.position = ""',
      '    refs.nodeImage.style.left = ""',
      '    refs.nodeImage.style.top = ""',
      '    refs.nodeImage.style.transform = ""',
      '    imageOffset = { x: 0, y: 0 }',
      '',
      '    if (fitMode === "fitHeight") {',
      '      refs.nodeImage.classList.add("node-image-fit-height")',
      '      refs.mediaRoot.classList.add("media-root-fit")',
      '      requestAnimationFrame(() => {',
      '        applyImageTransform(0, 0)',
      '        const cRect = refs.mediaRoot.getBoundingClientRect()',
      '        const iRect = refs.nodeImage.getBoundingClientRect()',
      '        if (iRect.width > cRect.width) {',
      '          applyImageTransform(0, 0)',
      '        }',
      '      })',
      '    } else if (fitMode === "fitWidth") {',
      '      refs.nodeImage.classList.add("node-image-fit-width")',
      '      refs.mediaRoot.classList.add("media-root-fit")',
      '      requestAnimationFrame(() => {',
      '        applyImageTransform(0, 0)',
      '        const cRect = refs.mediaRoot.getBoundingClientRect()',
      '        const iRect = refs.nodeImage.getBoundingClientRect()',
      '        if (iRect.height > cRect.height) {',
      '          applyImageTransform(0, 0)',
      '        }',
      '      })',
      '    } else {',
      '      refs.nodeImage.classList.add("node-image-fill")',
      '    }',
      '',
      '    refs.hotspots.style.left = "0px"',
      '    refs.hotspots.style.top = "0px"',
      '    refs.hotspots.style.width = "100%"',
      '    refs.hotspots.style.height = "100%"',
      '    renderHotspots()',
      '    requestAnimationFrame(() => {',
      '      updateHotspotViewport()',
      '    })',
      '    refs.hotspots.classList.toggle("hidden", transitioning)',
      '  }',
      '',
      '  requestAnimationFrame(() => {',
      '    confirmHostVisualCommitIfReady("render:next-frame")',
      '  })',
      '  if (!isHtml) {',
      '    refs.nodeImage.style.opacity = transitioning ? "0" : "1"',
      '  }',
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
