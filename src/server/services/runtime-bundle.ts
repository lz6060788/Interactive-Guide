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
      manifest = this.repo.readJson<PublishManifest>(`workspace/${guide.id}/manifest.json`)
      if (!manifest) {
        manifest = this.buildManifestFromWorkspace(guide)
      }
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

    if (workspaceFallback) {
      // Copy entire workspace directories to preserve HTML-referenced sub-resources
      this.repo.copyDir(`workspace/${guide.id}/nodes`, bundleNodesDir)
      this.repo.copyDir(`workspace/${guide.id}/edges`, bundleEdgesDir)
    } else {
      for (const node of manifest.nodes) {
        const htmlAsset = this.resolveNodeHtmlAssetPath(guide, node, workspaceFallback)
        if (htmlAsset) {
          this.repo.copyFile(htmlAsset, `${bundleNodesDir}/${path.basename(htmlAsset)}`)
        }

        const imageAsset = this.resolveNodeImageAssetPath(guide, node, workspaceFallback)
        if (imageAsset) {
          this.repo.copyFile(imageAsset, `${bundleNodesDir}/${path.basename(imageAsset)}`)
        }
      }
      for (const edge of manifest.edges) {
        const videoAsset = this.resolveEdgeVideoAssetPath(guide, edge, workspaceFallback)
        if (videoAsset) {
          this.repo.copyFile(videoAsset, `${bundleEdgesDir}/${path.basename(videoAsset)}`)
        }
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
      const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
      const localHtmlPath = this.resolveNodeHtmlAssetPath(guide, node, workspaceFallback)
      const localImagePath = this.resolveNodeImageAssetPath(guide, node, workspaceFallback)

      if (nodeKind === 'html') {
        if (!localHtmlPath || !this.repo.fileExists(localHtmlPath)) {
          throw AppError.validation(`Missing HTML asset for standalone bundle: ${node.id}.html`)
        }
        return {
          ...node,
          contentType: 'html' as const,
          htmlUrl: `./assets/nodes/${path.basename(localHtmlPath)}`,
          imageUrl: localImagePath ? `./assets/nodes/${path.basename(localImagePath)}` : undefined,
        }
      }

      if (nodeKind === 'surface') {
        return {
          ...node,
          imageUrl: localImagePath ? `./assets/nodes/${path.basename(localImagePath)}` : node.imageUrl,
          surfaceConfig: node.surfaceConfig
            ? {
                ...node.surfaceConfig,
                sourceImageUrl: localImagePath ? `./assets/nodes/${path.basename(localImagePath)}` : node.surfaceConfig.sourceImageUrl,
              }
            : node.surfaceConfig,
        }
      }

      if (!localImagePath || !this.repo.fileExists(localImagePath)) {
        throw AppError.validation(`Missing node asset for standalone bundle: ${node.id}.png`)
      }
      return {
        ...node,
        imageUrl: `./assets/nodes/${path.basename(localImagePath)}`,
      }
    })

    const edges = manifest.edges.map(edge => {
      const localVideoPath = this.resolveEdgeVideoAssetPath(guide, edge, workspaceFallback)
      const hasLocalVideo = !!localVideoPath && this.repo.fileExists(localVideoPath)
      if (edge.videoUrl && !hasLocalVideo) {
        throw AppError.validation(`Missing edge asset for standalone bundle: ${edge.id}.mp4`)
      }
      return {
        ...edge,
        videoUrl: hasLocalVideo && localVideoPath
          ? `./assets/edges/${path.basename(localVideoPath)}`
          : undefined,
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
      const nodeKind = n.nodeKind ?? (n.contentType === 'html' ? 'html' : 'image')
      const hasImage = this.repo.fileExists(`workspace/${guide.id}/nodes/${n.id}.png`)
      if (nodeKind === 'html') {
        return {
          id: n.id,
          title: n.title,
          extensions: n.extensions,
          nodeKind,
          contentType: 'html' as const,
          htmlUrl: `${mediaBase}/nodes/${n.id}.html`,
          imageUrl: hasImage ? `${mediaBase}/nodes/${n.id}.png` : undefined,
          hotspotEdgeIds: n.hotspotEdgeIds,
          imageFitMode: n.imageFitMode,
          surfaceConfig: n.surfaceConfig,
          surfaceLayers: n.surfaceLayers,
          hotspots: (n.hotspots ?? []).map(hs => ({
            edgeId: hs.edgeId,
            targetNodeId: hs.targetNodeId,
            label: hs.label,
            normalizedX: hs.normalizedX,
            normalizedY: hs.normalizedY,
            radius: hs.radius,
            markerType: 'dot' as const,
            style: hs.style,
          })),
        }
      }
      return {
        id: n.id,
        title: n.title,
        extensions: n.extensions,
        nodeKind,
        imageUrl: `${mediaBase}/nodes/${n.id}.png`,
        imageFitMode: n.imageFitMode,
        surfaceConfig: n.surfaceConfig
          ? { ...n.surfaceConfig, sourceImageUrl: `${mediaBase}/nodes/${n.id}.png` }
          : undefined,
        surfaceLayers: n.surfaceLayers,
        hotspots: (n.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot' as const,
          style: hs.style,
        })),
      }
    })

    const edges = guide.edges.map(e => {
      const localVideoPath = this.resolveEdgeVideoAssetPath(guide, e, true)
      return {
        ...e,
        videoUrl: localVideoPath ? `./assets/edges/${path.basename(localVideoPath)}` : undefined,
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
      runtimeConfig: guide.runtimeConfig,
      infoOverlay: guide.infoOverlay,
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

  private resolveNodeHtmlAssetPath(
    guide: KnowledgePackage,
    node: PublishManifest['nodes'][number],
    workspaceFallback: boolean,
  ): string | null {
    if (node.contentType !== 'html') return null
    const fileNames = this.buildCandidateFileNames(
      node.htmlUrl,
      [`${node.id}.html`],
    )
    return this.findNodeAssetPath(guide, fileNames, workspaceFallback)
  }

  private resolveNodeImageAssetPath(
    guide: KnowledgePackage,
    node: PublishManifest['nodes'][number],
    workspaceFallback: boolean,
  ): string | null {
    const fileNames = this.buildCandidateFileNames(
      node.imageUrl,
      [`${node.id}.png`],
    )
    return this.findNodeAssetPath(guide, fileNames, workspaceFallback)
  }

  private resolveEdgeVideoAssetPath(
    guide: KnowledgePackage,
    edge: PublishManifest['edges'][number],
    workspaceFallback: boolean,
  ): string | null {
    const legacyFileName = `${edge.fromNodeId}-to-${edge.toNodeId}.mp4`
    const fileNames = this.buildCandidateFileNames(
      edge.videoUrl,
      [`${edge.id}.mp4`, legacyFileName],
    )
    return this.findEdgeAssetPath(guide, fileNames, workspaceFallback)
  }

  private findNodeAssetPath(
    guide: KnowledgePackage,
    fileNames: string[],
    workspaceFallback: boolean,
  ): string | null {
    const candidates = workspaceFallback
      ? fileNames.map(fileName => `workspace/${guide.id}/nodes/${fileName}`)
      : [
          ...fileNames.map(fileName => `publish/${guide.id}/${guide.version}/assets/nodes/${fileName}`),
          ...fileNames.map(fileName => `workspace/${guide.id}/nodes/${fileName}`),
        ]

    return this.findExistingAssetPath(candidates)
  }

  private findEdgeAssetPath(
    guide: KnowledgePackage,
    fileNames: string[],
    workspaceFallback: boolean,
  ): string | null {
    const candidates = workspaceFallback
      ? fileNames.map(fileName => `workspace/${guide.id}/edges/${fileName}`)
      : [
          ...fileNames.map(fileName => `publish/${guide.id}/${guide.version}/assets/edges/${fileName}`),
          ...fileNames.map(fileName => `workspace/${guide.id}/edges/${fileName}`),
        ]

    return this.findExistingAssetPath(candidates)
  }

  private findExistingAssetPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (this.repo.fileExists(candidate)) {
        return candidate
      }
    }
    return null
  }

  private buildCandidateFileNames(url: string | undefined, fallbacks: string[]): string[] {
    const fileNames = new Set<string>()
    const fromUrl = this.extractAssetFileName(url)
    if (fromUrl) {
      fileNames.add(fromUrl)
    }
    for (const fallback of fallbacks) {
      if (fallback) {
        fileNames.add(fallback)
      }
    }
    return [...fileNames]
  }

  private extractAssetFileName(url: string | undefined): string | null {
    if (!url) return null
    const sanitized = url.split('?')[0]?.split('#')[0] ?? ''
    if (!sanitized) return null
    const fileName = sanitized.split('/').filter(Boolean).pop() ?? ''
    return fileName || null
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
      '    <main class="runtime-main">',
      '      <div id="viewport" class="player-viewport">',
      '        <div id="runtime-loading" class="runtime-loading-overlay">',
      '          <div class="runtime-loading-content">',
      '            <div class="runtime-loading-spinner" aria-hidden="true"></div>',
      '            <div id="runtime-loading-text" class="runtime-loading-text">加载 manifest...</div>',
      '          </div>',
      '        </div>',
      '        <div id="stage" class="stage" hidden>',
      '          <div id="media-root" class="media-root">',
      '            <img id="node-image" class="node-image" alt="" />',
      '            <iframe id="node-iframe" class="node-iframe" sandbox="allow-scripts allow-same-origin"></iframe>',
      '            <video id="transition-video" class="transition-video" muted playsinline></video>',
      '            <div id="hotspots" class="hotspots"></div>',
      '          </div>',
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
      'video::-webkit-media-controls {',
      '  display: none !important;',
      '}',
      'video::-webkit-media-controls-enclosure {',
      '  display: none !important;',
      '}',
      'html, body { margin: 0; min-height: 100%; background: #000; color: var(--text); font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; }',
      'button { font: inherit; }',
      '.runtime-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 0; background: #000; }',
      '.runtime-main { position: relative; flex: 1; min-height: 100vh; width: 100%; }',
      '.player-viewport { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #000; }',
      '.runtime-loading-overlay { position: absolute; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(2, 3, 5, 0.82); }',
      '.runtime-loading-overlay.hidden { display: none; }',
      '.runtime-loading-content { display: flex; flex-direction: column; align-items: center; gap: 12px; }',
      '.runtime-loading-spinner { width: 28px; height: 28px; border-radius: 999px; border: 2px solid rgba(255,255,255,0.18); border-top-color: rgba(255,255,255,0.92); animation: runtime-loading-spin 0.8s linear infinite; }',
      '.runtime-loading-text { color: rgba(244, 244, 245, 0.78); font-size: 14px; line-height: 20px; }',
      '@keyframes runtime-loading-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      '.stage { position: absolute; overflow: hidden; background: #000; }',
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

  /** Read the pre-built shared runtime host IIFE bundle. */
  private buildPlayerHostScript(): string {
    const distPath = path.resolve(
      process.cwd(),
      'src/runtime/player-core/dist/player-host.js',
    )
    if (!fs.existsSync(distPath)) {
      throw AppError.validation(
        'Missing player-host runtime bundle. Run `npm run build:player-host` before packaging.',
      )
    }
    return fs.readFileSync(distPath, 'utf-8')
  }

  private buildRuntimeScript(): string {
    const playerHostIife = this.buildPlayerHostScript()

    const bootstrapCode = [
      'const refs = {}',
      'let host = null',
      '',
      'const RUNTIME_MESSAGE_SOURCE = "interactive-guide-runtime"',
      'const HOST_MESSAGE_SOURCE = "interactive-guide-host"',
      '',
      'window.addEventListener("message", handleHostMessage)',
      '',
      'function postToHost(targetWindow, targetOrigin, message) {',
      '  if (!targetWindow || typeof targetWindow.postMessage !== "function") return',
      '  targetWindow.postMessage({ source: RUNTIME_MESSAGE_SOURCE, ...message }, targetOrigin)',
      '}',
      '',
      'function postReadyMessage() {',
      '  if (window.parent && window.parent !== window) {',
      '    postToHost(window.parent, "*", {',
      '      type: "interactive-guide:ready",',
      '      state: host?.getState() ?? null,',
      '    })',
      '  }',
      '}',
      '',
      'function resolveTargetOrigin(origin) {',
      '  return origin && origin !== "null" ? origin : "*"',
      '}',
      '',
      'function handleHostMessage(event) {',
      '  const data = event.data',
      '  if (!data || data.source !== HOST_MESSAGE_SOURCE || data.type !== "interactive-guide:command") return',
      '',
      '  let ok = false',
      '  let payload = null',
      '  const action = data.action',
      '  const params = data.payload || {}',
      '',
      '  try {',
      '    if (action === "navigateToNode") {',
      '      ok = host?.navigateToNode(String(params.nodeId)) ?? false',
      '    } else if (action === "navigateByEdge") {',
      '      ok = host?.navigateByEdge(String(params.edgeId)) ?? false',
      '    } else if (action === "handleBack") {',
      '      if (host) {',
      '        host.handleBack()',
      '        ok = true',
      '      }',
      '    } else if (action === "getState") {',
      '      payload = host?.getState() ?? null',
      '      ok = true',
      '    }',
      '  } catch (error) {',
      '    payload = { message: error instanceof Error ? error.message : String(error) }',
      '  }',
      '',
      '  postToHost(event.source, resolveTargetOrigin(event.origin), {',
      '    type: "interactive-guide:response",',
      '    requestId: data.requestId ?? null,',
      '    action,',
      '    ok,',
      '    payload,',
      '  })',
      '}',
      '',
      'document.addEventListener("DOMContentLoaded", () => {',
      '  refs.viewport = document.getElementById("viewport")',
      '  refs.stage = document.getElementById("stage")',
      '  refs.mediaRoot = document.getElementById("media-root")',
      '  refs.nodeImage = document.getElementById("node-image")',
      '  refs.nodeIframe = document.getElementById("node-iframe")',
      '  refs.hotspots = document.getElementById("hotspots")',
      '  refs.video = document.getElementById("transition-video")',
      '  refs.loading = document.getElementById("runtime-loading")',
      '  refs.loadingText = document.getElementById("runtime-loading-text")',
      '  init().catch(error => { console.error(error); })',
      '})',
      '',
      'async function init() {',
      '  const response = await fetch("./manifest.json", { cache: "no-store" })',
      '  if (!response.ok) throw new Error("无法加载 manifest.json")',
      '  const manifest = await response.json()',
      '',
      '  const PlayerHostCtor = window.InteractiveGuidePlayerHost',
      '  if (!PlayerHostCtor) throw new Error("InteractiveGuidePlayerHost is not available")',
      '',
      '  host = new PlayerHostCtor({',
      '    viewport: refs.viewport,',
      '    stage: refs.stage,',
      '    container: refs.mediaRoot,',
      '    nodeImage: refs.nodeImage,',
      '    nodeIframe: refs.nodeIframe,',
      '    video: refs.video,',
      '    hotspots: refs.hotspots,',
      '  }, {',
      '    onStateChange: render,',
      '    onError: error => console.error(error),',
      '  })',
      '',
      '  host.loadManifest(manifest)',
      '',
      '  document.title = `${manifest.title} - Runtime Bundle`',
      '  render(host.getState())',
      '  postReadyMessage()',
      '}',
      '',
      'function render(state) {',
      '  if (!state) return',
      '  const loadingEl = refs.loading',
      '  const loadingTextEl = refs.loadingText',
      '  if (!loadingEl || !loadingTextEl) return',
      '  if (state.preloading) {',
      '    loadingEl.classList.remove("hidden")',
      '    loadingTextEl.textContent = "预加载运行时资源..."',
      '  } else {',
      '    loadingEl.classList.add("hidden")',
      '  }',
      '}',
    ].join('\n')

    return playerHostIife + '\n' + bootstrapCode
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
