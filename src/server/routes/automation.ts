import { Router } from 'express'
import { AUTOMATION_PROTOCOL_VERSION, WORKBENCH_VERSION } from '../workbench-version.js'
import {
  GUIDE_AUTHORING_BUNDLE_CONTRACT,
  GUIDE_AUTHORING_BUNDLE_VERSION,
} from '../../automation/contracts/authoring-bundle-v1.js'
import {
  GUIDE_AUTHORING_CHANGESET_CONTRACT,
  GUIDE_AUTHORING_CHANGESET_VERSION,
} from '../../automation/contracts/authoring-changeset-v1.js'
import {
  GUIDE_AUTHORING_STATE_CONTRACT,
  GUIDE_AUTHORING_STATE_VERSION,
} from '../../automation/contracts/authoring-state-v1.js'

export { AUTOMATION_PROTOCOL_VERSION, WORKBENCH_VERSION }

const IMPLEMENTED_CAPABILITIES = [
  'approval-gated-release',
  'atomic-authoring-create',
  'atomic-authoring-update',
  'atomic-dual-product-build',
  'authoring-state-read',
  'catalog-initial-focus',
  'content-addressed-authoring-blobs',
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
    authoringContracts: [
      {
        name: GUIDE_AUTHORING_BUNDLE_CONTRACT,
        selected: GUIDE_AUTHORING_BUNDLE_VERSION,
        supported: [GUIDE_AUTHORING_BUNDLE_VERSION],
      },
      {
        name: GUIDE_AUTHORING_CHANGESET_CONTRACT,
        selected: GUIDE_AUTHORING_CHANGESET_VERSION,
        supported: [GUIDE_AUTHORING_CHANGESET_VERSION],
      },
    ],
    authoringStateContract: {
      name: GUIDE_AUTHORING_STATE_CONTRACT,
      selected: GUIDE_AUTHORING_STATE_VERSION,
      supported: [GUIDE_AUTHORING_STATE_VERSION],
    },
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
