// ============================================================
// Interactive Guide - Panorama Product Builder
// ============================================================

import type { PanoramaHtmlProduct } from '../../shared/panorama-types.js'
import type { KnowledgePackage } from '../../shared/types.js'
import { validatePanoramaHtmlProduct } from '../../shared/panorama-validators.js'

export interface PanoramaProductBuildResult {
  product: PanoramaHtmlProduct
  validationErrors: string[]
  validationWarnings: string[]
}

export class PanoramaProductBuilder {
  build(product: PanoramaHtmlProduct): PanoramaProductBuildResult {
    const validation = validatePanoramaHtmlProduct(product)
    if (!validation.valid) {
      throw new Error(`Invalid panorama product: ${validation.errors.join('; ')}`)
    }
    return {
      product,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    }
  }

  buildFromGuide(guide: KnowledgePackage): PanoramaProductBuildResult {
    const product = guide.panoramaEditorDocument?.product
    if (!product) {
      throw new Error(`Guide "${guide.id}" does not contain a panorama product`)
    }

    const nextProduct = structuredClone(product)
    nextProduct.metadata = {
      ...nextProduct.metadata,
      updatedAt: guide.metadata?.updatedAt ?? nextProduct.metadata.updatedAt,
    }

    return this.build(nextProduct)
  }
}
