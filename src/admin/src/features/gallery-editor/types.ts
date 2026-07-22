export type GalleryEditorSelection =
  | { kind: 'category'; id: string }
  | { kind: 'item'; id: string }
  | null
