import './setup'

/**
 * useGlobalShortcuts tests — verifies keyboard routing logic.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useGlobalShortcuts, type Shortcut } from '../hooks/useGlobalShortcuts'
import { createRef } from 'react'
import { fireEvent } from '@testing-library/react'

function ShortcutHarness({ shortcuts }: { shortcuts: Shortcut[] }): JSX.Element {
  useGlobalShortcuts({ shortcuts })
  return <div data-testid="harness" tabIndex={0} />
}

function fireKey(opts: { key: string; metaKey?: boolean; ctrlKey?: boolean }) {
  fireEvent.keyDown(window, { key: opts.key, metaKey: !!opts.metaKey, ctrlKey: !!opts.ctrlKey })
}

describe('useGlobalShortcuts', () => {
  it('fires Cmd/Ctrl+S when Cmd+S is pressed', () => {
    const run = vi.fn()
    render(<ShortcutHarness shortcuts={[{ key: 's', meta: true, description: '', run }]} />)
    fireKey({ key: 's', metaKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('fires Ctrl+S on non-macOS', () => {
    const run = vi.fn()
    render(<ShortcutHarness shortcuts={[{ key: 's', meta: true, description: '', run }]} />)
    fireKey({ key: 's', ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('fires bare V when no modifier is held', () => {
    const run = vi.fn()
    render(<ShortcutHarness shortcuts={[{ key: 'v', bare: true, description: '', run }]} />)
    fireKey({ key: 'v' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not fire when typing in an input', () => {
    const run = vi.fn()
    function TypedHarness(): JSX.Element {
      useGlobalShortcuts({ shortcuts: [{ key: 's', meta: true, description: '', run }] })
      return <input data-testid="ipt" />
    }
    render(<TypedHarness />)
    const ipt = document.querySelector('[data-testid="ipt"]') as HTMLElement
    fireEvent.keyDown(ipt, { key: 's', metaKey: true })
    expect(run).not.toHaveBeenCalled()
  })

  it('respects case insensitive keys', () => {
    const run = vi.fn()
    render(<ShortcutHarness shortcuts={[{ key: 'S', meta: true, description: '', run }]} />)
    fireKey({ key: 's', metaKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('skips dispatch when enabled is false', () => {
    const run = vi.fn()
    function OffHarness({ on }: { on: boolean }): JSX.Element {
      useGlobalShortcuts({ enabled: on, shortcuts: [{ key: 's', meta: true, description: '', run }] })
      return <div />
    }
    render(<OffHarness on={false} />)
    fireKey({ key: 's', metaKey: true })
    expect(run).not.toHaveBeenCalled()
  })
})
