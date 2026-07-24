# Existing Workbench HTTP Contract

Use `scripts/workbench-client.mjs`; it restricts traffic to loopback, reports JSON, re-reads after writes, and prevents download overwrites.

## Commands

```text
list --base-url URL
get --base-url URL --project-id ID
create --base-url URL --input FILE
update --base-url URL --project-id ID --section SECTION --input FILE [--expected-revision N]
upload --base-url URL --project-id ID --kind KIND --asset-id ID --file FILE [--content-type MIME] [--expected-revision N]
preview --base-url URL --project-id ID --product atlas|catalog|gallery
export --base-url URL --project-id ID --output-dir DIR --products atlas,catalog,gallery
```

The `base-url` is the `apiUrl` printed by the launcher. The launcher presents both UI and `/api` through the same loopback origin.
`--products` accepts one type, a comma-separated selection, or `all`. The legacy value `--product both` remains an Atlas/Catalog alias, but new workflows must pass the inventory selection explicitly.

## Create Body

```json
{ "id": "project-id", "title": "中文标题", "locale": "zh-CN" }
```

After creation, update `metadata` with `titleLocale: "en-US"` and the English title. Keep both supported locales in `localization`.

## Section Bodies

Pass the section value itself, not the top-level project wrapper:

- `metadata`: `{ "title": "...", "titleLocale": "en-US", "version": "1.0.0", "locale": "zh-CN" }`
- `localization`: `{ "defaultLocale": "zh-CN", "supportedLocales": ["zh-CN", "en-US"] }`
- `knowledge`: the complete `project.knowledge` object.
- `panorama`: the complete `project.panorama` object.
- `scenes`: the complete `project.scenes` array.
- `navigation`: the complete `project.navigation` object.
- `atlas`: the complete `project.products.atlas` object.
- `catalog`: the complete `project.products.catalog` object.
- `gallery`: the complete `project.products.gallery` object.
- `integrations`: the complete `project.integrations` object.

Read the current project first and preserve unrelated values when preparing a complete section body. Every localized user-visible value must contain non-empty `zh-CN` and `en-US` entries before final preview.
When Gallery is selected, preserve its Workbench defaults, set `enabled` to `true`, and populate `itemImageAssetIds` with every third-level item ID and its uploaded image asset ID.

## Asset Order

1. Create the project.
2. Upload each real asset. Use `image`, `video`, or zipped `html-bundle` and stable asset IDs.
3. Read the project so the server-created asset definitions are available.
4. Update panorama, Gallery item-image mappings, scenes, navigation, and integrations to reference those asset IDs as applicable.

Never add asset registry entries by editing storage. Asset uploads are the only supported registration path.

## Revision Conflicts

If the client returns HTTP 409, stop the attempted write, fetch the current project, compare it with the intended section, and apply a new targeted update. Do not automatically replay stale content.

## Final Output

`export` builds fresh draft previews for exactly the selected products from one project revision, downloads their existing ZIP endpoints, verifies ZIP signatures, writes without overwriting, and reports each file's SHA-256. It fails before building when Gallery is selected but `project.products.gallery.enabled` is not `true`.
