# Review and Delivery

Give the user the launcher's `uiUrl` and keep the launcher alive during review.

## Review Checklist

- Project title, stage/category/item titles, descriptions, hints, scene titles, and share copy are complete in `zh-CN` and `en-US`.
- When selected, Atlas preview works in both locales; all category hotspots, item markers, callouts, viewports, zoom thresholds, scenes, and transitions match the supplied references.
- When selected, Catalog preview works in both locales; all items appear under the correct stage/category and each focus rectangle/viewport is accurate.
- When selected, Gallery preview works in both locales; every third-level item has the correct image and the authored item order is preserved.
- Panorama and all referenced assets load locally.
- Share behavior and analytics settings match the supplied values or remain disabled.
- Every selected product is reviewed as an independent output on its target platform. Unselected products are outside the delivery gate.

Report omissions from the material inventory rather than silently accepting defaults. Continue targeted repairs until the user explicitly confirms that review is complete.

## Delivery Gate

Only after explicit confirmation:

1. Fetch the project once more and record its revision.
2. Run `export --products <selection>` with the exact inventory `productTypes`.
3. Confirm every selected build uses that revision.
4. Return the absolute selected ZIP paths, sizes, and SHA-256 values.
5. Stop the exact launcher process/session created for this work.

If any selected build or download fails, do not describe delivery as complete. Fix the reported project validation or packaging error, rebuild the selected products, and repeat the gate.
