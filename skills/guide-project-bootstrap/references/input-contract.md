# BootstrapInput contract

The bootstrap CLI accepts a JSON file matching the `BootstrapInput` interface
declared in `src/server/bootstrap.ts`. This document is a quick reference; the
TypeScript source is authoritative.

## Top-level fields

```ts
interface BootstrapInput {
  project: { id: string; title: string; version?: string; locale?: string }
  knowledge: {
    stages: Array<{
      key: 'upstream' | 'midstream' | 'downstream'
      categories: Array<{
        id?: string
        title: string
        items: Array<{ id?: string; title: string; description?: string; tags?: string[] }>
        htmlScene?: { sceneId: string; viewId: string }
      }>
    }>
  }
  panoramaImagePath?: string
  spatial?: {
    categories?: Record<string, {
      hotspot: { x: number; y: number }
      viewport?: { centerX: number; centerY: number; zoom: number }
      activationZoom?: number
      hotspotMinZoom?: number
    }>
    items?: Record<string, {
      marker: { x: number; y: number }
      focusRect?: { x: number; y: number; width: number; height: number; radius?: number; maskOpacity?: number }
      viewportOverride?: { centerX: number; centerY: number; zoom: number }
      callout?: { markerPosition: 'top' | 'bottom'; markerGapPx: number; minZoom?: number }
      markerMinZoom?: number
    }>
  }
  htmlSceneBundles?: Array<{
    id: string
    title: string
    path: string
    entryPath?: string
    views: Array<{ id: string; title: string; activationMessageType: string; categoryBindings: string[] }>
  }>
  transitionVideos?: Array<{
    from: ExperienceLocation
    to: ExperienceLocation
    path: string
    timeoutMs?: number
    onFailure?: 'abort-navigation' | 'cut'
  }>
  integrations?: {
    analytics?: { enabled: boolean; profileId: string; pageType: string; contentName?: string }
    share?: { enabled: boolean; title?: string; description?: string }
  }
}
```

## Example

```json
{
  "project": { "id": "rocket-supply-chain", "title": "商业航天产业链" },
  "knowledge": {
    "stages": [
      {
        "key": "upstream",
        "categories": [
          {
            "title": "运载火箭",
            "items": [
              { "title": "长征八号甲", "description": "新一代中型运载火箭" },
              { "title": "谷神星一号", "description": "小型固体运载火箭" }
            ],
            "htmlScene": { "sceneId": "scene-rocket", "viewId": "v-rocket" }
          }
        ]
      }
    ]
  },
  "panoramaImagePath": "./assets/panorama.jpg",
  "htmlSceneBundles": [
    {
      "id": "scene-rocket",
      "title": "运载火箭三维场景",
      "path": "./assets/scene-rocket.zip",
      "views": [
        { "id": "v-rocket", "title": "火箭结构", "activationMessageType": "init", "categoryBindings": ["upstream-运载火箭"] }
      ]
    }
  ]
}
```

## Notes

- `id` fields are optional. When omitted, IDs are derived from the title via
  `slugify` (lowercase, kebab-case, CJK characters hex-encoded).
- Stage `key` must be one of `upstream`, `midstream`, `downstream`. Unknown
  keys are reported under `unmappedKnowledge`.
- Duplicate IDs across categories/items/scene bundles land in `unmappedKnowledge`
  with `reason: "id already used"`.
- `spatial` keys must use the final category/item IDs. Fully authored spatial
  input clears the calibration queue; omitted entries remain explicitly queued.
- Spatial coordinates are normalized to `[0,1]`; pixel coordinates from source
  annotation images must be converted before they enter this contract.
- The panorama image defaults to the project's first category viewport when
  no panorama image is supplied (the `autoPickPanoramaAsset` branch of the
  normalizer). In practice, always supply a real panorama.
