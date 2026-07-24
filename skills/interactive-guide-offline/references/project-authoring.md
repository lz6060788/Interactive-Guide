# Project Authoring Shapes

Always start from `get` output and preserve its existing defaults. These examples explain the authored fields; they are not a second project schema.

## Localized Text

Every user-visible value is an object keyed by locale:

```json
{
  "zh-CN": "动态随机存取存储器",
  "en-US": "Dynamic Random-Access Memory"
}
```

Do not copy Chinese into `en-US`, mechanically transliterate, or create empty strings. Ask the user for missing translation authority.

## Knowledge

Keep exactly three stages in upstream → midstream → downstream order. Category and item IDs are stable, locale-neutral identifiers.

```json
{
  "stages": [
    {
      "key": "upstream",
      "label": { "zh-CN": "上游", "en-US": "Upstream" },
      "order": 1,
      "categories": []
    },
    {
      "key": "midstream",
      "label": { "zh-CN": "中游", "en-US": "Midstream" },
      "order": 2,
      "categories": [
        {
          "id": "storage-products",
          "title": { "zh-CN": "存储芯片产品", "en-US": "Memory Products" },
          "order": 0,
          "itemIds": ["dram"],
          "experience": { "kind": "panorama" }
        }
      ]
    },
    {
      "key": "downstream",
      "label": { "zh-CN": "下游", "en-US": "Downstream" },
      "order": 3,
      "categories": []
    }
  ],
  "items": {
    "dram": {
      "id": "dram",
      "categoryId": "storage-products",
      "title": { "zh-CN": "DRAM", "en-US": "DRAM" },
      "description": {
        "zh-CN": "用户提供的中文说明",
        "en-US": "User-provided English description"
      },
      "order": 0
    }
  }
}
```

Each `itemIds` entry must exist in `items`, and each item's `categoryId` must point back to that category. Orders are zero-based within categories/items; stage orders are fixed at 1/2/3.

## Panorama and Placement

This section is required when Atlas or Catalog is selected. Upload the panorama first, read the resulting asset definition, then set `panorama.assetId`. Coordinates are normalized to `[0,1]`.

```json
{
  "assetId": "asset-panorama",
  "coordinateSpace": "normalized",
  "cameraBounds": { "minZoom": 1, "maxZoom": 4 },
  "initialViewport": { "centerX": 0.5, "centerY": 0.5, "zoom": 1 },
  "categories": {
    "storage-products": {
      "hotspot": { "x": 0.48, "y": 0.31 },
      "viewport": { "centerX": 0.48, "centerY": 0.31, "zoom": 3.6 }
    }
  },
  "items": {
    "dram": {
      "marker": { "x": 0.52, "y": 0.42 },
      "focusRect": {
        "x": 0.44,
        "y": 0.34,
        "width": 0.16,
        "height": 0.12,
        "radius": 0.02,
        "maskOpacity": 0.55
      },
      "callout": { "markerPosition": "top", "markerGapPx": 12 }
    }
  }
}
```

Treat the numbers above as shape examples only. Never use them as fallback coordinates. Items intended for Catalog require `focusRect`; use the UI to calibrate unavailable placements.

## Product Membership

- Treat the inventory `productTypes` as the delivery selection. It does not replace or extend the Workbench project schema.
- Add the intended category IDs to `products.atlas.categoryIds`.
- Preserve `products.catalog.stageOrder` as `upstream`, `midstream`, `downstream`.

### Gallery

Upload every item image, preserve the current `products.gallery` defaults, set `enabled` to `true`, and populate `itemImageAssetIds`:

```json
{
  "enabled": true,
  "itemImageAssetIds": {
    "dram": "asset-gallery-dram"
  }
}
```

Send the complete current Gallery section with these fields merged in. Every authored item must have a real uploaded image before Gallery can compile.

### Shared Rules

- Preserve editor-created interaction/theme/viewport defaults unless the user asks to change them.
- Localize optional `hintText` in both locales.
- Do not disable or rewrite an unselected product. Preserve its project config and omit it from preview/export instead.

## Scenes and Routes

Upload an HTML scene ZIP before adding its scene object. A category using a scene has:

```json
{
  "kind": "html-scene",
  "sceneId": "scene-id",
  "viewId": "view-id"
}
```

The scene must reference the server-created HTML bundle asset ID and include the user-provided view activation message. Navigation routes and transition video asset IDs must point only to existing panorama locations/scenes/assets. Do not infer a route from visual proximity.

## Integrations

Keep `integrations` empty when no real configuration is supplied. When enabled, analytics uses the provided `appKey`, `pageType`, `name`, and `defaultSource`; sharing uses bilingual `title`/`description` and an uploaded `imageAssetId` when supplied.
