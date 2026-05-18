// ============================================================
// Interactive Guide - Guide Hydration Service
// ============================================================
// Hydrates guide edge transitions from generates/ history.
// Extracted from routes/guides.ts for better separation of concerns.

import type { Repository } from '../storage/repository.js'
import type { KnowledgePackage, TransitionStrategyMode, TransitionVisualPlan } from '../../shared/types.js'

const GENERATES_DIR = 'generates'

export function hydrateGuideEdgeTransitions(guide: KnowledgePackage, repo: Repository): KnowledgePackage {
  const generatesDir = GENERATES_DIR

  // Find latest generate for this guide using repo's refresh + loadAllGenerates
  const allGenerates = repo.loadAllGenerates()
  const latest = Array.from(allGenerates.values())
    .filter(record => record.packageId === guide.id)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0]

  if (!latest) return guide

  guide.edges = guide.edges.map(edge => {
    const transitionPath = `${generatesDir}/${latest.buildId}/edges/${edge.id}/transition.json`
    if (!repo.fileExists(transitionPath)) return edge

    const transition = repo.readJson<{
      prompt?: string
      strategyMode?: string
      strategyReason?: string
      visualPlan?: unknown
    }>(transitionPath)
    if (!transition) return edge

    const manualTransitionPrompt = edge.manualTransitionPrompt
      ?? (
        edge.transitionDescriptionMode === 'manual' && edge.transitionPrompt
          ? edge.transitionPrompt
          : undefined
      )

    return {
      ...edge,
      manualTransitionPrompt,
      transitionStrategyMode: (transition.strategyMode ?? edge.transitionStrategyMode) as TransitionStrategyMode | undefined,
      transitionStrategyReason: transition.strategyReason ?? edge.transitionStrategyReason,
      transitionPlan: transition.visualPlan as TransitionVisualPlan | undefined,
      transitionPrompt: transition.prompt ?? edge.transitionPrompt,
      transitionPath: `generates/${latest.buildId}/edges/${edge.id}/transition.json`,
    }
  })

  return guide
}