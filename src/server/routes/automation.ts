import { Router } from 'express'

export const WORKBENCH_VERSION = '0.2.0'
export const AUTOMATION_PROTOCOL_VERSION = '1.0'

const IMPLEMENTED_CAPABILITIES = [
  'atomic-dual-product-build',
  'catalog-initial-focus',
  'draft-product-build',
  'localized-content',
  'project-section-update',
  'revision-locked-update',
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
