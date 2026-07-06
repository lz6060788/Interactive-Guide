/**
 * AtlasEditor store — Zustand-backed UI state.
 *
 * Only UI / selection state lives here. Authoritative project data stays in
 * React Query; mutations flow through the api.ts hooks.
 */
import { create } from 'zustand'
import type { Tool } from './components/AtlasToolbar'

export type Selection =
  | { kind: 'category'; id: string }
  | { kind: 'item'; id: string }
  | null

interface AtlasEditorState {
  tool: Tool
  selection: Selection
  hoveredCoord: { x: number; y: number } | null
  zoom: number
  dirty: boolean
  setTool: (tool: Tool) => void
  setSelection: (selection: Selection) => void
  setHoveredCoord: (c: { x: number; y: number } | null) => void
  setZoom: (z: number) => void
  setDirty: (d: boolean) => void
  reset: () => void
}

export const useAtlasEditorStore = create<AtlasEditorState>((set) => ({
  tool: 'select',
  selection: null,
  hoveredCoord: null,
  zoom: 1,
  dirty: false,
  setTool: (tool) => set({ tool }),
  setSelection: (selection) => set({ selection }),
  setHoveredCoord: (hoveredCoord) => set({ hoveredCoord }),
  setZoom: (zoom) => set({ zoom }),
  setDirty: (dirty) => set({ dirty }),
  reset: () => set({ tool: 'select', selection: null, hoveredCoord: null, zoom: 1, dirty: false }),
}))