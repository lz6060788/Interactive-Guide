/**
 * CatalogEditor store — UI selection state.
 */
import { create } from 'zustand'

export type CatalogSelection =
  | { kind: 'category'; id: string }
  | { kind: 'item'; id: string }
  | null

interface CatalogEditorState {
  selection: CatalogSelection
  selectedStage: 'upstream' | 'midstream' | 'downstream'
  dirty: boolean
  setSelection: (s: CatalogSelection) => void
  setSelectedStage: (s: 'upstream' | 'midstream' | 'downstream') => void
  setDirty: (d: boolean) => void
  reset: () => void
}

export const useCatalogEditorStore = create<CatalogEditorState>((set) => ({
  selection: null,
  selectedStage: 'upstream',
  dirty: false,
  setSelection: (selection) => set({ selection }),
  setSelectedStage: (selectedStage) => set({ selectedStage }),
  setDirty: (dirty) => set({ dirty }),
  reset: () => set({ selection: null, selectedStage: 'upstream', dirty: false }),
}))