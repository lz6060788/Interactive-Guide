import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  configureHorizontalTabs,
  revealHorizontalTab,
  styleCenteredRuntimeHint,
} from '../../src/products/contracts/structured-runtime-chrome.js'

interface FakeElement {
  style: Record<string, string>
  classList: { add: (name: string) => void }
  ownerDocument: Document
  scrollWidth: number
  clientWidth: number
  scrollLeft: number
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
}

function createFakeElement(): {
  element: FakeElement
  classes: string[]
  listeners: Map<string, EventListenerOrEventListenerObject>
} {
  const classes: string[] = []
  const listeners = new Map<string, EventListenerOrEventListenerObject>()
  const document = {
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: () => undefined },
  } as unknown as Document
  return {
    element: {
      style: {},
      classList: { add: name => classes.push(name) },
      ownerDocument: document,
      scrollWidth: 480,
      clientWidth: 200,
      scrollLeft: 0,
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type)
      },
    },
    classes,
    listeners,
  }
}

describe('structured runtime chrome', () => {
  it('keeps long category rows horizontally scrollable without visible scrollbars', () => {
    const { element, classes, listeners } = createFakeElement()
    const release = configureHorizontalTabs(element as unknown as HTMLElement)

    assert.equal(element.style.overflowX, 'auto')
    assert.equal(element.style.overflowY, 'hidden')
    assert.equal(element.style.scrollbarWidth, 'none')
    assert.equal(element.style.msOverflowStyle, 'none')
    assert.deepEqual(classes, ['ig-structured-horizontal-tabs'])

    let prevented = false
    const wheel = listeners.get('wheel') as EventListener
    wheel({ deltaX: 0, deltaY: 44, preventDefault: () => (prevented = true) } as unknown as Event)
    assert.equal(element.scrollLeft, 44)
    assert.equal(prevented, true)

    release()
    assert.equal(listeners.has('wheel'), false)
  })

  it('uses symmetric insets for centered hints with and without a corner action', () => {
    const hint = { style: {} } as unknown as HTMLElement
    styleCenteredRuntimeHint(hint, true)
    assert.equal(hint.style.left, '64px')
    assert.equal(hint.style.right, '64px')
    assert.equal(hint.style.textAlign, 'center')

    styleCenteredRuntimeHint(hint, false)
    assert.equal(hint.style.left, '16px')
    assert.equal(hint.style.right, '16px')
  })

  it('reveals the active category near the horizontal center', () => {
    let options: ScrollIntoViewOptions | undefined
    revealHorizontalTab({
      scrollIntoView: next => {
        options = next
      },
    } as unknown as HTMLElement)
    assert.deepEqual(options, { behavior: 'smooth', block: 'nearest', inline: 'center' })
  })
})
