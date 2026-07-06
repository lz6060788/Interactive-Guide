import './setup'

/**
 * ImeSafeInput — verifies the CJK IME composition fix.
 *
 * The bug: when a user types Chinese via an IME, the input fires
 * `input` events for each composition update (pinyin, candidates, ...).
 * A plain controlled input calls onChange on each, and the parent's
 * re-render rewinds the visible text — resulting in "a's'daa's'd" in
 * the field instead of the chosen CJK character.
 *
 * The fix in ImeSafeInput: hold a local "draft" while composing, only
 * call onChange once at composition end. These tests pin the contract
 * at the public-API level (what the parent sees) rather than the
 * internal DOM value, which is fragile in jsdom.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { ImeSafeInput } from '../components/ImeSafeInput'
import { system } from '../theme/system'

function renderInput(value: string, onChange: (v: string) => void) {
  return render(
    <ChakraProvider value={system}>
      <ImeSafeInput value={value} onChange={onChange} aria-label="test" />
    </ChakraProvider>,
  )
}

describe('ImeSafeInput', () => {
  it('forwards plain (non-IME) typing through onChange', () => {
    const onChange = vi.fn()
    renderInput('', onChange)
    const input = screen.getByLabelText('test') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('does NOT call onChange during IME composition', () => {
    const onChange = vi.fn()
    renderInput('', onChange)
    const input = screen.getByLabelText('test') as HTMLInputElement

    fireEvent.compositionStart(input)
    // Each composition update is an `input` event. With composing=true,
    // ImeSafeInput swallows the updates and does not call onChange.
    fireEvent.change(input, { target: { value: 'n' } })
    fireEvent.change(input, { target: { value: 'ni' } })
    fireEvent.change(input, { target: { value: 'ni hao' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the final value once at composition end', () => {
    const onChange = vi.fn()
    renderInput('', onChange)
    const input = screen.getByLabelText('test') as HTMLInputElement

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'ni' } })
    fireEvent.change(input, { target: { value: '你' } })
    fireEvent.compositionEnd(input)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('你')
  })

  it('resumes forwarding onChange after composition ends', () => {
    const onChange = vi.fn()
    renderInput('', onChange)
    const input = screen.getByLabelText('test') as HTMLInputElement

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '你' } })
    fireEvent.compositionEnd(input)
    onChange.mockClear()

    // After composition, regular typing should pass through again.
    fireEvent.change(input, { target: { value: '你好' } })
    expect(onChange).toHaveBeenCalledWith('你好')
  })
})
