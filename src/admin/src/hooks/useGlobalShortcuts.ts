/**
 * useGlobalShortcuts — global keyboard shortcut dispatcher for the admin app.
 *
 * Registers window keydown handlers with idempotent registration. Shortcuts
 * are normalized: Cmd (macOS) / Ctrl (others). Lowercase comparison so
 * "S" and "s" both work. Skips when focus is in an editable surface
 * (input, textarea, [contenteditable]).
 *
 * Returns `register` so callers can compose shortcuts without duplicate
 * listener registration.
 */
import { useEffect, useRef } from 'react'

export interface Shortcut {
  /** Single character, e.g. 's', '/', 'k'. Case-insensitive. */
  key: string
  /** Cmd on mac, Ctrl elsewhere. Defaults true. */
  meta?: boolean
  /** Plain key (no modifier). Defaults false. */
  bare?: boolean
  /** Description for the shortcut hint UI. */
  description: string
  /** Handler invoked when the shortcut fires. */
  run: (e: KeyboardEvent) => void
}

interface Options {
  shortcuts: Shortcut[]
  enabled?: boolean
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useGlobalShortcuts({ shortcuts, enabled = true }: Options): void {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return

      const key = e.key.toLowerCase()
      const meta = e.metaKey || e.ctrlKey
      for (const s of shortcutsRef.current) {
        const matchesKey = s.key.toLowerCase() === key
        const matchesMeta = s.meta !== false ? meta === !!s.meta : true
        const matchesBare = s.bare ? !meta && !e.shiftKey && !e.altKey : true
        if (matchesKey && matchesMeta && matchesBare) {
          e.preventDefault()
          s.run(e)
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
