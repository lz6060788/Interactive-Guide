# Material Intake

Collect source material before creating or updating a project. The agent may translate and structure user-provided content, but must not invent missing facts, translations, coordinates, or integration values.

## Required

- Project ID in kebab-case.
- Chinese and English project titles; default locale (`zh-CN` or `en-US`).
- At least one authoritative knowledge document defining the strict three-level structure: stage → category → item. It must contain or support both Chinese and English user-visible copy.
- A locale-neutral panorama/background image with no embedded language-specific text.

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
  "transitionVideos": []
}
```

Run `node scripts/material-inventory.mjs --input <file>` and retain the resulting hashes in the work log.
