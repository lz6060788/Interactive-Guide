# GuideProject 2.0 schema

The bootstrap CLI and Phase 3/4 compilers all consume the same canonical
project shape, defined in `src/domain/project-types.ts` and validated by
`src/domain/project-schema.ts`.

## Top-level shape

```ts
interface GuideProject {
  schemaVersion: '2.0.0'
  id: string                 // kebab-case identifier
  title: string              // operator-facing title
  version: string            // semver-ish; e.g. "0.1.0"
  locale: string             // BCP-47; e.g. "zh-CN"

  knowledge: {
    stages: [IndustryStage, IndustryStage, IndustryStage]   // fixed 3
    items: Record<string, IndustryItem>
  }

  assets: {
    byId: Record<string, AssetDefinition>
  }

  panorama: PanoramaModel    // image asset id, categories/items spatial layout
  scenes: HtmlScenePackage[]
  navigation: ExperienceNavigation  // routes between panorama and scenes

  products: {
    atlas: AtlasConfig       // free-exploration product
    catalog: CatalogConfig   // structured knowledge product
  }

  integrations: {
    analytics?: AnalyticsConfig
    share?: ShareConfig
  }

  metadata: { createdAt: string; updatedAt: string; revision: number; schemaVersion: '2.0.0' }
}
```

## Industry chain invariants

- `knowledge.stages` is a fixed-length tuple of three `IndustryStage`s, indexed by
  `key: 'upstream' | 'midstream' | 'downstream'` (in that order).
- Every category declares an `experience` pointing to either the panorama
  (`{ kind: 'panorama' }`) or a specific scene view (`{ kind: 'html-scene', sceneId, viewId }`).
- Every item belongs to exactly one category via `categoryId`.
- Item IDs must be globally unique across all categories and all items
  (validated by `validateDraftProject`).

## Asset registry

`assets.byId` is a `Record<string, AssetDefinition>` keyed by asset id.
Each definition includes:

- `kind: 'image' | 'video' | 'html-bundle'`
- `sourcePath: string` — project-relative path under the project asset directory
- `mimeType`, `size`, `sha256`
- `entryPath?` (html-bundle only) — entry filename relative to `sourcePath`

The manifest compiler (Phase 6) rewrites `sourcePath` to a package-relative URL
during release.

## Spatial layout

The `panorama.categories` and `panorama.items` records carry the spatial
calibration that the runtime needs to render hotspots, markers, and focus
rects. Calibration is **mandatory** for release (`validateReleaseProject`),
but may be left empty at draft time. The bootstrap Skill populates a
centered default and reports missing calibration work via
`calibrationQueue`.

## Validators

Two-tier validation:

- `validateDraftProject(project)` — structural + business invariants only.
  Used at every save.
- `validateReleaseProject(project)` — adds `checkCalibrationCompleteness`
  which requires every category to have a `hotspot` and every item to have a
  `marker` + `focusRect`. Used before producing an immutable release.