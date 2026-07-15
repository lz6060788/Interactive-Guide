---
name: guide-project-bootstrap
description: Bootstrap a GuideProject 2.0 from a directory of knowledge (categories/items), a panorama image, HTML scene bundles, and optional transition videos. Builds a NormalizedProject, copies assets via AssetService, and emits a BootstrapReport describing unmapped knowledge and pending calibration work.
---

# guide-project-bootstrap

This Skill scaffolds a new project from raw authoring materials:

- A **knowledge file** (JSON) describing industry-chain stages, categories, and items.
- A **panorama image** (jpg/png/webp).
- One or more **HTML scene bundles** (zipped `index.html` + assets).
- Optional **transition videos** referenced by experience routes.

It stages the project through `ProjectService`, registers all assets via `AssetService`, validates and compiles both products, then atomically moves the complete project into the configured data directory. It produces a `BootstrapReport` describing:

- What was successfully wired (categories → experience, scenes → panorama hotspots, routes).
- **Unmapped knowledge** (categories/items/scene ids that collided or had no slot).
- **Calibration queue** (categories/items that still need `hotspot` / `marker` / `focusRect` layout).

## When to use

- The operator is starting a new industry-chain guide from scratch.
- A new panorama or HTML scene bundle needs to be wired into an existing project.
- The build pipeline needs a deterministic starting point for Phase 3/4 compilers.

## When NOT to use

- The project already exists and only needs asset updates — call `AssetService` directly.
- The user is asking to *release* a project — that is `release-project-build`, not this Skill.

## Workflow

1. Read the knowledge file with `read_json_file` or the equivalent.
2. Add normalized `spatial` entries when calibrated hotspot, marker or focusRect data is available.
3. Run `scripts/bootstrap-project.ts <input.json> [--data-dir DATA_DIR]`.
4. The CLI assembles through `src/server/bootstrap.ts`, stages assets through `ProjectService` and `AssetService`, validates and compiles both products, then installs the project atomically.
5. Read the emitted report to surface unmapped knowledge and pending calibration work to the operator.

The skill outputs a BootstrapReport describing what to do next.

## Scripts

- `scripts/bootstrap-project.ts` — CLI entry point that reads `input.json`, resolves relative asset paths from that file, stages and validates the complete project, then atomically installs it into `DATA_DIR`.
- `scripts/validate-project.ts` — CLI entry point that re-runs `validateProject` against an existing `project.json` on disk.

## References

- `references/input-contract.md` — BootstrapInput JSON schema with examples.
- `references/project-schema.md` — GuideProject 2.0 schema (see also `src/domain/project-schema.ts`).
- `references/calibration-queue.md` — what the calibration queue means and how to clear it.
