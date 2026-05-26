// ============================================================
// Interactive Guide - Generate Service (Facade)
// ============================================================
// Thin facade over BuildPipeline + PromptBuilder + RuntimeBundleGenerator.
// All actual logic is in pipeline.ts, prompt-builder.ts, runtime-bundle.ts.

import type { Repository } from '../storage/repository.js'
import type { RuntimeBundlePayload } from '../../shared/types.js'
import { BuildPipeline } from './pipeline.js'
import { PromptBuilder } from './prompt-builder.js'
import { RuntimeBundleGenerator } from './runtime-bundle.js'
import { BundleUploader, type BundleUploadResult } from './bundle-uploader.js'
import { isObjectStorageConfigured } from '../storage/object-storage.js'

import type * as vision from '../ai/vision.js'
import type * as image from '../ai/image.js'
import type * as video from '../ai/video.js'
import type * as media from '../ai/media.js'

// ─── GenerateService (Facade) ─────────────────────────────────

export class GenerateService {
  constructor(
    private repo: Repository,
    visionModule: typeof vision,
    imageModule: typeof image,
    videoModule: typeof video,
    mediaModule: typeof media,
  ) {
    const promptBuilder = new PromptBuilder()
    const bundleGenerator = new RuntimeBundleGenerator(repo)
    this._pipeline = new BuildPipeline(
      repo,
      visionModule,
      imageModule,
      videoModule,
      mediaModule,
      promptBuilder,
      bundleGenerator,
    )
    this._promptBuilder = promptBuilder
  }

  // ─── Public API (delegated to BuildPipeline) ───────────────

  startGenerate(guideId: string) {
    return this._pipeline.startGenerate(guideId)
  }

  cancelGenerate(generateId: string) {
    return this._pipeline.cancelGenerate(generateId)
  }

  getRecord(generateId: string) {
    return this._pipeline.getRecord(generateId)
  }

  listGenerates() {
    return this._pipeline.listGenerates()
  }

  getLogs(generateId: string) {
    return this._pipeline.getLogs(generateId)
  }

  regenerateNode(guideId: string, nodeId: string) {
    return this._pipeline.regenerateNode(guideId, nodeId)
  }

  regenerateEdge(guideId: string, edgeId: string) {
    return this._pipeline.regenerateEdge(guideId, edgeId)
  }

  regenerateHotspots(guideId: string, nodeId: string) {
    return this._pipeline.regenerateHotspots(guideId, nodeId)
  }

  async packageGuide(guideId: string, autoUpload: boolean = true): Promise<RuntimeBundlePayload> {
    const bundle = await this._pipeline.packageGuide(guideId)

    if (autoUpload && isObjectStorageConfigured()) {
      const uploader = new BundleUploader()
      await uploader.uploadBundle(bundle.bundleId)
    }

    return bundle
  }

  async publishBundle(bundleId: string): Promise<BundleUploadResult> {
    const uploader = new BundleUploader()
    return uploader.uploadBundle(bundleId)
  }

  // ─── PromptBuilder access (for internal use by tests) ────────

  get promptBuilder(): PromptBuilder {
    return this._promptBuilder
  }

  // ─── Private ───────────────────────────────────────────────

  private readonly _pipeline: BuildPipeline
  private readonly _promptBuilder: PromptBuilder
}