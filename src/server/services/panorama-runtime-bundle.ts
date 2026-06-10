// ============================================================
// Interactive Guide - Panorama Runtime Bundle Service
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import type { PanoramaHtmlProduct } from '../../shared/panorama-types.js'
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
    const generatedAt = nowISO()

    this.repo.ensureDir(panoramaAssetsDir)

    const bundledProduct = this.buildBundledProduct(guide, buildResult.product, panoramaAssetsDir)
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

    if (nextProduct.globalPanoramaAsset) {
      nextProduct.globalPanoramaAsset.imageUrl = rewriteImageUrl(nextProduct.globalPanoramaAsset.imageUrl) ?? nextProduct.globalPanoramaAsset.imageUrl
    }

    nextProduct.sections.forEach(section => {
      section.groups.forEach(group => {
        group.panoramaAsset.imageUrl = rewriteImageUrl(group.panoramaAsset.imageUrl) ?? group.panoramaAsset.imageUrl
      })
    })

    return nextProduct
  }

  private resolvePanoramaAssetPath(guide: KnowledgePackage, imageUrl: string): string | null {
    const fileName = this.extractFileName(imageUrl)
    if (!fileName) return null

    const workspaceCandidate = `workspace/${guide.id}/nodes/${fileName}`
    if (this.repo.fileExists(workspaceCandidate)) {
      return workspaceCandidate
    }

    const publishCandidate = `publish/${guide.id}/${guide.version}/assets/nodes/${fileName}`
    if (this.repo.fileExists(publishCandidate)) {
      return publishCandidate
    }

    return null
  }

  private extractFileName(url: string | undefined): string | null {
    if (!url) return null
    const sanitized = url.split('?')[0]?.split('#')[0] ?? ''
    const fileName = sanitized.split('/').filter(Boolean).pop() ?? ''
    return fileName || null
  }

  private buildIndexHtml(title: string): string {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
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
