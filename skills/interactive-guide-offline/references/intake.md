# Material Intake

Collect source material before creating or updating a project. The agent may translate and structure user-provided content, but must not invent missing facts, translations, coordinates, or integration values.

## Required

- Product types to generate, as a non-empty selection of:
  - `atlas` — 独立交互图
  - `catalog` — 全景交互图
  - `gallery` — 普通交互图
- Project ID in kebab-case.
- Chinese and English project titles; default locale (`zh-CN` or `en-US`).
- At least one authoritative knowledge document defining the strict three-level structure: stage → category → item. It must contain or support both Chinese and English user-visible copy.
- When `atlas` or `catalog` is selected, a locale-neutral panorama/background image with no embedded language-specific text.
- When `gallery` is selected, one locale-neutral image for every third-level item, with an explicit item ID → image mapping.

## Ask For When Applicable

- Hotspot position map for category hotspots and category viewports.
- Callout/focus position map for item markers, callouts, and Catalog focus rectangles.
- HTML scene bundles as ZIP files, including their scene/view bindings.
- Transition videos and the routes they belong to.
- Chinese and English share title/description plus optional share image.
- Analytics settings: enabled state, `appKey`, `pageType`, `name`, and `defaultSource`.
- Existing project ID and exact requested changes when this is an update.
- Final output directory.

If a positioning map is absent, record the affected fields for manual calibration in the workbench. If share or analytics material is absent, keep that integration disabled unless the user explicitly supplies configuration.

## Inventory Shape

Paths are relative to the inventory JSON file or absolute local paths.

```json
{
  "productTypes": ["atlas", "catalog", "gallery"],
  "project": {
    "id": "memory-chip-industry-chain",
    "title": {
      "zh-CN": "存储芯片产业链",
      "en-US": "Memory Chip Industry Chain"
    },
    "defaultLocale": "zh-CN"
  },
  "knowledgeDocuments": ["materials/knowledge.md"],
  "panoramaImage": "materials/panorama.webp",
  "hotspotPositionMap": "materials/hotspots.json",
  "calloutPositionMap": "materials/callouts.json",
  "shareCopy": "materials/share.json",
  "analyticsConfig": "materials/analytics.json",
  "htmlSceneBundles": [],
  "transitionVideos": [],
  "galleryItemImages": [
    {
      "itemId": "dram",
      "path": "materials/gallery/dram.webp"
    }
  ]
}
```

Run `node scripts/material-inventory.mjs --input <file>` and retain the resulting hashes in the work log.
The inventory rejects missing `productTypes`, requires `panoramaImage` only for Atlas/Catalog, and requires `galleryItemImages` when Gallery is selected.
