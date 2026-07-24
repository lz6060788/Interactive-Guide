---
name: interactive-guide-offline
description: Orchestrate offline creation, targeted updates, workbench review, and selected Atlas, Catalog, or Gallery ZIP delivery for bilingual Interactive Guide projects. Use when an operator wants an agent to choose one or more product types, collect the corresponding industry-chain knowledge and visual materials, and create or revise a project through the bundled local workbench without changing workbench source code.
---

# Interactive Guide Offline

Use the bundled workbench as the deterministic authoring engine. Act as the orchestration layer: first establish the required product types, collect their real materials, translate them into existing HTTP API calls, start the local review UI, wait for explicit user acceptance, then export only the selected independent HTML ZIPs.

Never invent knowledge, translations, coordinates, assets, share copy, or analytics values. Mark missing optional inputs for review. Keep all traffic on loopback and never edit `workbench/data` directly.

## Workflow

1. Read [references/intake.md](references/intake.md). First ask which product types to generate: `atlas` (独立交互图), `catalog` (全景交互图), and/or `gallery` (普通交互图). Then ask for the project identity, bilingual knowledge source, and the materials required by that selection. Do not proceed past intake while required material is missing.
2. Create an inventory JSON and run `node scripts/material-inventory.mjs --input <inventory.json>`. Resolve reported errors with the user. Optional omissions become an explicit manual-review list.
3. Start the packaged workbench with `node scripts/launcher.mjs --workspace <workspace-directory>`. Keep the process running and capture its JSON `uiUrl` and `apiUrl` output.
4. Read [references/http-api.md](references/http-api.md) and [references/project-authoring.md](references/project-authoring.md). Use `node scripts/workbench-client.mjs` to create or inspect the project, upload assets, and update only the sections supported by the current HTTP API. Re-read the project after every write. On a revision conflict, inspect the latest state before retrying.
5. Open the returned `uiUrl` for the user. Read [references/review-and-delivery.md](references/review-and-delivery.md) and give the user a concise review checklist covering both locales and only the selected products: Atlas hotspots/callouts, Catalog focus rectangles, Gallery item images, scenes, share copy, and analytics as applicable.
6. Continue targeted API updates or let the user repair values in the UI. Do not export merely because validation passes; wait for explicit user confirmation that review is complete.
7. After confirmation, run `node scripts/workbench-client.mjs export --base-url <apiUrl> --project-id <id> --output-dir <directory> --products <comma-separated-selection>`. Return every selected output path and its SHA-256 value.
8. Stop only the launcher process started in step 3. Never terminate unrelated Node processes.

## Operational Rules

- Treat `project.json` semantics and the existing workbench API as the contract. The Skill is not a second domain model.
- Keep `zh-CN` and `en-US` complete for every user-visible text field. Images are locale-neutral unless the user explicitly says otherwise.
- Use normalized `[0,1]` coordinates exactly as supplied or calibrated in the UI.
- Prefer targeted section updates over replacing unrelated project state.
- Build fresh previews for exactly the selected product types immediately before final download. Do not build or deliver unselected products.
- Downloads never overwrite existing files. Choose a new output directory or ask the user how to handle a collision.
- If the bundled workbench is missing, stop and explain that the repository Skill source must first be assembled with `npm run package:offline-skill`.

## Commands

```text
node scripts/material-inventory.mjs --input <inventory.json>
node scripts/launcher.mjs --workspace <workspace-directory> [--port <ui-port>] [--backend-port <api-port>]
node scripts/workbench-client.mjs <command> --base-url <apiUrl> ...
```

Run any command with `--help` for exact arguments. Detailed request shapes are in [references/http-api.md](references/http-api.md).
