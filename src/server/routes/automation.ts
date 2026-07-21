import { Router } from 'express'
import { AUTOMATION_PROTOCOL_VERSION, WORKBENCH_VERSION } from '../workbench-version.js'

export { AUTOMATION_PROTOCOL_VERSION, WORKBENCH_VERSION }

const IMPLEMENTED_CAPABILITIES = [
  'approval-gated-release',
  'atomic-dual-product-build',
  'catalog-initial-focus',
  'draft-product-build',
  'localized-content',
  'project-section-update',
  'revision-bound-review-approval',
  'revision-locked-update',
  'versioned-release-api',
] as const

export function getWorkbenchCapabilities() {
  return {
    workbenchVersion: WORKBENCH_VERSION,
    automationProtocol: {
      selected: AUTOMATION_PROTOCOL_VERSION,
      supported: [AUTOMATION_PROTOCOL_VERSION],
    },
    // Populated only after a stable external authoring contract exists.
    authoringContracts: [],
    projectSchemas: {
      read: ['2.0.0', '3.0.0'],
      write: ['3.0.0'],
    },
    products: ['atlas', 'catalog'],
    capabilities: IMPLEMENTED_CAPABILITIES,
  }
}

/** Stable, versioned entry point used by external orchestration clients. */
export function createAutomationRouter(): Router {
  const router = Router()

  router.get('/automation/v1/capabilities', (_req, res) => {
    res.json({
      data: getWorkbenchCapabilities(),
    })
  })

  return router
}
