// ============================================================
// Interactive Guide - Panorama Runtime Bundle Service
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import type { PanoramaHtmlProduct } from '../../shared/panorama-types.js'
import { isHtmlGroup, isPanoramaGroup } from '../../shared/panorama-types.js'
import type { KnowledgePackage } from '../../shared/types.js'
import type { Repository } from '../storage/repository.js'
import { nowISO } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'
import { PanoramaProductBuilder } from './panorama-product-builder.js'

export interface PanoramaRuntimeBundlePayload {
  bundleId: string
  guideId: string
  productId: string
  version: string
  generatedAt: string
  entryUrl: string
  bundleUrl: string
  productUrl: string
}

export class PanoramaRuntimeBundleService {
  private readonly productBuilder = new PanoramaProductBuilder()

  constructor(private readonly repo: Repository) {}

  buildRuntimeBundle(guide: KnowledgePackage): PanoramaRuntimeBundlePayload {
    const buildResult = this.productBuilder.buildFromGuide(guide)
    const bundleId = `${guide.id}-panorama-${Date.now()}`
    const bundleDir = `panorama-bundles/${bundleId}`
    const panoramaAssetsDir = `${bundleDir}/assets/panoramas`
    const htmlAssetsDir = `${bundleDir}/assets/html`
    const generatedAt = nowISO()

    this.repo.ensureDir(panoramaAssetsDir)
    this.repo.ensureDir(htmlAssetsDir)

    const bundledProduct = this.buildBundledProduct(guide, buildResult.product, panoramaAssetsDir, htmlAssetsDir)
    bundledProduct.metadata = {
      ...bundledProduct.metadata,
      generatedAt,
    }

    const bundleBase = `/api/panorama-bundles/${bundleId}/`
    const payload: PanoramaRuntimeBundlePayload = {
      bundleId,
      guideId: guide.id,
      productId: bundledProduct.id,
      version: guide.version,
      generatedAt,
      entryUrl: `${bundleBase}index.html`,
      bundleUrl: bundleBase,
      productUrl: `${bundleBase}panorama-product.json`,
    }

    this.repo.writeJson(`${bundleDir}/bundle.json`, payload)
    this.repo.writeJson(`${bundleDir}/panorama-product.json`, bundledProduct)
    this.repo.writeFile(`${bundleDir}/index.html`, Buffer.from(this.buildIndexHtml(bundledProduct.title), 'utf-8'))
    this.repo.writeFile(`${bundleDir}/styles.css`, Buffer.from(this.buildStyles(), 'utf-8'))
    this.repo.writeFile(`${bundleDir}/app.js`, Buffer.from(this.buildRuntimeScript(), 'utf-8'))

    return payload
  }

  private buildBundledProduct(
    guide: KnowledgePackage,
    product: PanoramaHtmlProduct,
    panoramaAssetsDir: string,
    htmlAssetsDir: string,
  ): PanoramaHtmlProduct {
    const nextProduct = structuredClone(product)
    const copiedAssetUrlBySource = new Map<string, string>()

    const rewriteImageUrl = (imageUrl: string | undefined): string | undefined => {
      if (!imageUrl) return imageUrl
      const cached = copiedAssetUrlBySource.get(imageUrl)
      if (cached) return cached

      const sourcePath = this.resolvePanoramaAssetPath(guide, imageUrl)
      if (!sourcePath) {
        copiedAssetUrlBySource.set(imageUrl, imageUrl)
        return imageUrl
      }

      const fileName = this.extractFileName(imageUrl)
      if (!fileName) {
        copiedAssetUrlBySource.set(imageUrl, imageUrl)
        return imageUrl
      }

      const destPath = `${panoramaAssetsDir}/${fileName}`
      if (!this.repo.fileExists(destPath)) {
        this.repo.copyFile(sourcePath, destPath)
      }
      const bundledUrl = `./assets/panoramas/${fileName}`
      copiedAssetUrlBySource.set(imageUrl, bundledUrl)
      return bundledUrl
    }

    const rewriteHtmlEntryUrl = (entryUrl: string | undefined, assetId: string): string | undefined => {
      if (!entryUrl) return entryUrl
      const cached = copiedAssetUrlBySource.get(`${assetId}:${entryUrl}`)
      if (cached) return cached

      const sourcePath = this.resolvePanoramaAssetPath(guide, entryUrl)
      if (!sourcePath) {
        copiedAssetUrlBySource.set(`${assetId}:${entryUrl}`, entryUrl)
        return entryUrl
      }

      const fileName = this.extractFileName(entryUrl)
      if (!fileName) {
        copiedAssetUrlBySource.set(`${assetId}:${entryUrl}`, entryUrl)
        return entryUrl
      }

      const targetDirName = this.sanitizeAssetSegment(assetId || path.basename(path.dirname(sourcePath)) || 'html-entry')
      const sourceDir = path.dirname(sourcePath)
      const destDir = `${htmlAssetsDir}/${targetDirName}`
      if (!this.repo.fileExists(destDir)) {
        this.repo.copyDir(sourceDir, destDir)
      }
      const bundledUrl = `./assets/html/${targetDirName}/${fileName}`
      copiedAssetUrlBySource.set(`${assetId}:${entryUrl}`, bundledUrl)
      return bundledUrl
    }

    if (nextProduct.globalPanoramaAsset) {
      nextProduct.globalPanoramaAsset.imageUrl = rewriteImageUrl(nextProduct.globalPanoramaAsset.imageUrl) ?? nextProduct.globalPanoramaAsset.imageUrl
    }

    nextProduct.sections.forEach(section => {
      section.groups.forEach(group => {
        if (isPanoramaGroup(group)) {
          group.panoramaAsset.imageUrl = rewriteImageUrl(group.panoramaAsset.imageUrl) ?? group.panoramaAsset.imageUrl
          return
        }
        if (isHtmlGroup(group)) {
          group.htmlAsset.entryUrl = rewriteHtmlEntryUrl(group.htmlAsset.entryUrl, group.htmlAsset.assetId) ?? group.htmlAsset.entryUrl
        }
      })
    })

    return nextProduct
  }

  private resolvePanoramaAssetPath(guide: KnowledgePackage, imageUrl: string): string | null {
    for (const candidate of this.buildAssetCandidates(guide, imageUrl)) {
      if (this.repo.fileExists(candidate)) {
        return candidate
      }
    }
    return null
  }

  private buildAssetCandidates(guide: KnowledgePackage, assetUrl: string): string[] {
    const sanitized = assetUrl.split('?')[0]?.split('#')[0]?.replace(/\\/g, '/') ?? ''
    if (!sanitized || /^https?:\/\//i.test(sanitized) || /^data:/i.test(sanitized)) {
      return []
    }

    const trimmed = sanitized.replace(/^\.\//, '').replace(/^\/+/, '')
    const workspaceMediaPrefix = `api/media/workspace/${guide.id}/`
    const publishMediaPrefix = `api/media/publish/${guide.id}/${guide.version}/`
    if (trimmed.startsWith(workspaceMediaPrefix)) {
      return [`workspace/${guide.id}/${trimmed.slice(workspaceMediaPrefix.length)}`]
    }
    if (trimmed.startsWith(publishMediaPrefix)) {
      return [`publish/${guide.id}/${guide.version}/${trimmed.slice(publishMediaPrefix.length)}`]
    }

    const normalized = trimmed
    const afterNodes = normalized.includes('nodes/') ? normalized.split('nodes/').pop() ?? normalized : normalized
    const afterAssetsNodes = normalized.includes('assets/nodes/')
      ? normalized.split('assets/nodes/').pop() ?? afterNodes
      : afterNodes

    return [
      `workspace/${guide.id}/${normalized}`,
      `workspace/${guide.id}/nodes/${normalized}`,
      `workspace/${guide.id}/nodes/${afterAssetsNodes}`,
      `publish/${guide.id}/${guide.version}/${normalized}`,
      `publish/${guide.id}/${guide.version}/assets/${normalized}`,
      `publish/${guide.id}/${guide.version}/assets/nodes/${afterAssetsNodes}`,
    ]
  }

  private extractFileName(url: string | undefined): string | null {
    if (!url) return null
    const sanitized = url.split('?')[0]?.split('#')[0] ?? ''
    const fileName = sanitized.split('/').filter(Boolean).pop() ?? ''
    return fileName || null
  }

  private sanitizeAssetSegment(value: string): string {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-')
    return normalized || 'asset'
  }

  private buildIndexHtml(title: string): string {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
      `  <title>${this.escapeHtml(title)} - Panorama Bundle</title>`,
      '  <link rel="stylesheet" href="./styles.css" />',
      '</head>',
      '<body>',
      '  <div id="app" class="panorama-bundle-shell">',
      '    <div id="panorama-loading" class="panorama-loading">加载全景产物...</div>',
      '    <div id="panorama-player-root" class="panorama-player-root"></div>',
      '  </div>',
      '  <script src="./app.js" defer></script>',
      '</body>',
      '</html>',
    ].join('\n')
  }

  private buildStyles(): string {
    return [
      ':root { color-scheme: dark; }',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; min-height: 100%; background: #000; }',
      'body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }',
      '.panorama-bundle-shell { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #05070b; }',
      '.panorama-player-root { width: 100%; height: 100%; }',
      '.panorama-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.78); font-size: 14px; z-index: 1; }',
      '.panorama-loading.is-hidden { display: none; }',
    ].join('\n')
  }

  private buildPlayerHostScript(): string {
    this.ensurePanoramaPlayerHostBuild()
    const distPath = path.resolve(
      process.cwd(),
      'src/panorama-runtime/player-core/dist/panorama-player-host.js',
    )
    if (!fs.existsSync(distPath)) {
      throw AppError.validation(
        'Missing panorama-player-host runtime bundle. Run `npm run build:panorama-player-host` before packaging.',
      )
    }
    return fs.readFileSync(distPath, 'utf-8')
  }

  private ensurePanoramaPlayerHostBuild(): void {
    const buildCommand = process.platform === 'win32'
      ? 'npm run build:panorama-player-host'
      : 'npm run build:panorama-player-host'
    try {
      execSync(buildCommand, {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh',
      })
    } catch (error) {
      const stdout = error instanceof Error && 'stdout' in error
        ? String((error as { stdout?: Buffer | string }).stdout ?? '')
        : ''
      const stderr = error instanceof Error && 'stderr' in error
        ? String((error as { stderr?: Buffer | string }).stderr ?? '')
        : ''
      const message = [stderr.trim(), stdout.trim()]
        .filter(Boolean)
        .join('\n')
        || 'Failed to build panorama-player-host runtime bundle'
      throw AppError.validation(message)
    }
  }

  private buildRuntimeScript(): string {
    const playerHostIife = this.buildPlayerHostScript()
    const bootstrapCode = [
      'let host = null',
      '',
      'document.addEventListener("DOMContentLoaded", () => {',
      '  void init()',
      '})',
      '',
      'async function init() {',
      '  const loadingEl = document.getElementById("panorama-loading")',
      '  const rootEl = document.getElementById("panorama-player-root")',
      '  if (!rootEl) throw new Error("Missing panorama-player-root container")',
      '',
      '  try {',
      '    const response = await fetch("./panorama-product.json", { cache: "no-store" })',
      '    if (!response.ok) throw new Error("无法加载 panorama-product.json")',
      '    const product = await response.json()',
      '    const HostCtor = window.PanoramaPlayerHost',
      '    if (!HostCtor) throw new Error("PanoramaPlayerHost is not available")',
      '    host = new HostCtor({ container: rootEl })',
      '    host.loadProduct(product)',
      '    document.title = `${product.title} - Panorama Bundle`',
      '    loadingEl?.classList.add("is-hidden")',
      '  } catch (error) {',
      '    if (loadingEl) {',
      '      loadingEl.textContent = error instanceof Error ? error.message : String(error)',
      '    }',
      '    console.error(error)',
      '  }',
      '}',
    ].join('\n')

    return `${playerHostIife}\n${bootstrapCode}`
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
