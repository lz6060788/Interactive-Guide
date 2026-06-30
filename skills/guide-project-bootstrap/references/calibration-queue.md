# Calibration queue

The bootstrap Skill cannot compute `hotspot`, `marker`, and `focusRect`
positions from a knowledge file alone — those coordinates depend on the
specific panorama image and the operator's editorial judgment about where
each concept lives.

When `assembleProject` runs without explicit spatial inputs, every category
and item ends up in the calibration queue:

```ts
interface CalibrationQueueEntry {
  kind: 'category' | 'item'
  id: string
  missingFields: string[]   // e.g. ['hotspot', 'viewport.zoom']
}
```

## How to clear it

1. Open the project in the admin workbench (`src/admin`).
2. Use the panorama canvas to drop hotspots for each category.
3. Use the item drawer to set `marker` and `focusRect` for each item.
4. Save the project — the next run of `validateReleaseProject` will pass.

## Why this is not auto-computed

- Hotspots depend on visual recognition of "where the rocket is in the
  panorama" — a job for vision models, not the bootstrap Skill.
- Marker / focusRect placement depends on UX choices about card sizing
  and overlap avoidance, which the operator must approve.

The bootstrap queue is the contract between the bootstrap Skill and the
admin workbench: the bootstrap Skill tells the workbench what is missing,
the workbench fills it in.