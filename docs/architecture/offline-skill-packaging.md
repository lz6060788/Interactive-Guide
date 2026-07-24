# Offline Skill Packaging Architecture

## Overview

`interactive-guide-offline` packages the existing Workbench server and admin build into an installable Agent Skill. The Skill is an orchestration layer: it first records the requested product types, collects their real authoring materials, requires the user to install declared runtime dependencies, calls the existing loopback HTTP API, exposes the existing admin UI for review, and downloads the selected Atlas/Catalog/Gallery preview ZIPs after explicit user acceptance.

This design keeps two independently evolving versions:

- The Workbench owns the domain model, validation, editors, preview compilers, and HTML products.
- The Skill owns intake, local process orchestration, HTTP calls, review gating, and delivery.

Rebuilding the Skill artifact incorporates a newer Workbench build without copying Workbench business rules into the Skill.

## Architecture

```text
Authoring materials
        |
        v
interactive-guide-offline Skill
  - material inventory
  - launcher / local facade
  - HTTP client
  - review and delivery workflow
        |
        | 127.0.0.1 HTTP only
        v
Existing Workbench
  - Express project and asset API
  - React admin build
  - Atlas/Catalog/Gallery preview builders
        |
        v
Workspace project data + selected standalone ZIPs
```

### Source and Artifact Layout

The repository keeps orchestration source under `skills/interactive-guide-offline/`. It does not check a Workbench copy into that directory.

`scripts/package-interactive-guide-skill.mjs` builds and assembles:

```text
interactive-guide-offline/
  SKILL.md
  agents/openai.yaml
  scripts/
  references/
  workbench/
    dist/server/                 # compiled server import closure
    dist/admin/                  # Vite admin build
    src/...                      # exact browser-runtime source closure
    vendor/king-fisher/          # runtime vendor scripts
    package.json                 # exact direct runtime dependency versions
    package-lock.json            # reproducible npm installation
    workbench-manifest.json
```

The runtime source closure is necessary because the current preview service invokes esbuild/Babel while producing standalone ES5 Atlas, Catalog, and Gallery bundles. The packager discovers those source inputs through esbuild metadata instead of copying the entire repository.

The ZIP never contains `node_modules`. Before first launch, the user runs `npm ci --omit=dev` in `workbench/`. After this one-time prerequisite, project authoring and preview generation remain local and use only loopback HTTP.

### Assembly Contract

The package command:

1. Builds the existing server and admin without modifying their source.
2. Traverses the compiled server's relative imports from `dist/server/index.js`.
3. Discovers the browser runtime source closures from the Atlas/Catalog/Gallery entry files.
4. Resolves exact direct, transitive, optional, and peer dependency metadata into `package.json` and `package-lock.json` without copying installed packages.
5. Writes a platform-specific ZIP with no `node_modules`, plus a Workbench manifest, artifact SHA-256, and sidecar checksum file.

Stale build directories such as the removed Automation implementation are not copied because assembly is closure-based rather than `dist/`-wide.

### Runtime Contract

`scripts/launcher.mjs` requires an explicit workspace directory and then:

1. Verifies all declared direct runtime dependencies exist under `workbench/node_modules`; otherwise it exits with the exact user installation command and directory.
2. Selects or accepts two free ports.
3. Starts only the bundled `dist/server/index.js` with `PORT`, `DATA_DIR`, and `CORS_ORIGIN`.
4. Waits for `/api/health`.
5. Binds a facade to `127.0.0.1`; `/api/**` is proxied to Express and all other paths serve the admin build with SPA fallback.
6. Emits one JSON readiness object containing `uiUrl`, `apiUrl`, workspace, and exact process IDs.
7. On `SIGINT` or `SIGTERM`, stops only its own backend child.

The HTTP client rejects non-loopback base URLs. It uses existing project, asset, localization, product config, preview, and ZIP download routes. It re-reads after writes, preserves revision conflicts for inspection, verifies downloaded ZIP signatures, and refuses to overwrite output files.

### Boundaries

- No Automation API, review-session API, second project schema, or Skill-specific Workbench route.
- No direct project-directory writes from the Skill.
- No network service binding beyond loopback.
- No bundled `node_modules` and no automatic dependency installation. The user owns the explicit `npm ci --omit=dev` step.
- No AI or synthetic fallback content. Missing optional material is surfaced for manual review.
- No final export before explicit user confirmation.
- Product selection is Skill workflow state (`productTypes`), not a second Workbench domain model. Unselected project sections are preserved and omitted from build/delivery.
- Atlas, Catalog, and Gallery remain independent HTML bundles; the selected subset is produced from one reviewed project revision.

### Versioning

The artifact filename contains Workbench version, platform, architecture, and a content-hash prefix. `workbench-manifest.json` records the source commit, Node major version, entrypoints, supported products, dependency installation command, resolved dependency count, and hashes of critical files including both dependency manifests.

Skill workflow changes can evolve independently as long as they use the existing HTTP contract. A Workbench change that affects build output, runtime dependencies, or the HTTP contract must be followed by a new Skill package build and the package verification gate.

## Flow

### Authoring

1. The agent first asks for one or more product types: Atlas (独立交互图), Catalog (全景交互图), or Gallery (普通交互图). It then asks for project identity, bilingual knowledge, and only the materials required by the selection.
2. `material-inventory.mjs` verifies local files and hashes them; missing optional inputs become a manual-review list.
3. If dependencies are missing, the user runs `npm ci --omit=dev` in the packaged `workbench/` directory and confirms completion.
4. The launcher starts the bundled Workbench.
5. `workbench-client.mjs` creates or updates the project through existing HTTP routes, including Gallery configuration, and uploads real assets.
6. The user reviews both locales and every selected product in the Workbench UI. The agent performs targeted repairs until the user confirms completion.
7. The client builds fresh previews for exactly the selected product types from the same revision and downloads their ZIPs with SHA-256 values.

### Build and Verification

```text
npm run package:offline-skill
npm run verify:offline-skill-package
```

The verification command rebuilds and assembles the artifact, asserts the ZIP has no `node_modules`, extracts it into an isolated local workspace, confirms the launcher requests user installation before dependencies exist, runs the declared install step, starts the packaged Workbench, validates UI/API routing, creates a minimal bilingual project, uploads a real image, enables Gallery with an item-image mapping, and builds/downloads all three product ZIPs. Any failure prevents the package from being treated as deliverable.
