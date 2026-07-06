# legacy/ — review note (Phase 6)

The files in this directory are intentionally **not migrated** in the
Chakra UI 3.35 cleanup (see `docs/development/前端工程开发与重构方案-2026-06-30.md`).

## Why they were skipped

- **`SurfacePreview.tsx`** is a WYSIWYG preview surface for the runtime
  product. It is excluded from the migration's scope (the brief only
  covers the admin workbench, not product runtime/preview surfaces).
- **`DetailDrawer.tsx`** and **`SurfaceNodeControls.tsx`** already use
  Chakra primitives (Box / Flex / Text / Button / Heading / IconButton),
  but they are themed **dark** (`slate-900 / #0a0b10` / `#2a2d3a`)
  rather than Cartographer's Desk paper/ink. They are not reachable
  from any current admin route, so re-theming them carries no user
  benefit and risks breaking the visual identity they were designed
  for.
- **`surface-node-utils.ts`** is a pure utility module with no UI.

## When to revisit

If any of these files become reachable from an admin route or the
product surface is repointed at the workbench, the dark theme should
be re-evaluated alongside the active migration.
