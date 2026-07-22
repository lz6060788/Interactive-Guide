import './setup'

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { mountRuntimeLocaleSwitcher } from '../../../product-shell/browser/shared/runtime-locale-switcher'

describe('runtime locale switcher', () => {
  it('stays hidden for a single-language product', () => {
    const root = document.createElement('div')
    mountRuntimeLocaleSwitcher({
      root,
      locale: 'zh-CN',
      supportedLocales: ['zh-CN'],
      onChange: vi.fn(),
    })
    expect(root).toBeEmptyDOMElement()
  })

  it('switches to another enabled language', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onChange = vi.fn()
    mountRuntimeLocaleSwitcher({
      root,
      locale: 'zh-CN',
      supportedLocales: ['zh-CN', 'en-US'],
      onChange,
    })

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(onChange).toHaveBeenCalledWith('en-US')
    root.remove()
  })
})
