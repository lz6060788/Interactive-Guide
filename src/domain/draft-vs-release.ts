/**
 * Draft vs Release — the two validation tiers.
 *
 * - Draft: editor state, may have placeholder spatial data, may not yet
 *   have HTML scene bundles registered. Required to be shape-valid.
 * - Release: produced by AtlasCompiler/CatalogCompiler, must be
 *   fully calibrated, all scene bundles and route transitions must be
 *   present, all coordinates must be in range, atlas.categoryIds must
 *   reference existing categories.
 */
import type { GuideProject } from './project-types.js'
import {
  validateDraftProject,
  validateReleaseProject,
  type ValidationResult,
} from './project-validator.js'

export type ProjectStage = 'draft' | 'release'

export function validateAsStage(project: GuideProject, stage: ProjectStage): ValidationResult {
  return stage === 'draft' ? validateDraftProject(project) : validateReleaseProject(project)
}

export function isReleaseReady(project: GuideProject): boolean {
  return validateReleaseProject(project).ok
}

export function draftIssues(project: GuideProject): ValidationResult {
  return validateDraftProject(project)
}

export function releaseIssues(project: GuideProject): ValidationResult {
  return validateReleaseProject(project)
}
