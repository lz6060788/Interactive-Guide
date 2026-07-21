# Review and Delivery

Give the user the launcher's `uiUrl` and keep the launcher alive during review.

## Review Checklist

- Project title, stage/category/item titles, descriptions, hints, scene titles, and share copy are complete in `zh-CN` and `en-US`.
- Atlas preview works in both locales; all category hotspots, item markers, callouts, viewports, zoom thresholds, scenes, and transitions match the supplied references.
- Catalog preview works in both locales; all items appear under the correct stage/category and each focus rectangle/viewport is accurate.
- Panorama and all referenced assets load locally.
- Share behavior and analytics settings match the supplied values or remain disabled.
- Atlas and Catalog are reviewed as independent outputs on their target platforms.

Report omissions from the material inventory rather than silently accepting defaults. Continue targeted repairs until the user explicitly confirms that review is complete.

## Delivery Gate

Only after explicit confirmation:

1. Fetch the project once more and record its revision.
2. Run `export` for `both` products.
3. Confirm both builds use that revision.
4. Return the absolute Atlas/Catalog ZIP paths, sizes, and SHA-256 values.
5. Stop the exact launcher process/session created for this work.

If either build or download fails, do not describe delivery as complete. Fix the reported project validation or packaging error, rebuild both products, and repeat the gate.
