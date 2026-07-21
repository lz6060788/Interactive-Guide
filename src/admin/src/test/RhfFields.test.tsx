import './setup'

/**
 * RhfFields smoke tests — verifies the four RHF + Chakra adapters
 * (`RhfTextField`, `RhfNumberField`, `RhfSelectField`, `RhfSwitchRow`)
 * connect a `react-hook-form` `useForm` to Chakra form primitives:
 * value flows in, change events flow back.
 *
 * Uses `fireEvent` rather than `userEvent` for the same reason the
 * rest of this test suite does — it works against jsdom without the
 * `userEvent.setup()` document-state workaround that is fragile
 * across user-event patch versions.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { useForm, type FieldValues } from 'react-hook-form'
import {
  RhfNumberField,
  RhfSelectField,
  RhfSwitchRow,
  RhfTextField,
} from '../components/RhfFields'
import { system } from '../theme/system'

interface FormShape extends FieldValues {
  title: string
  x: number
  kind: string
  enabled: boolean
}

function Harness({
  children,
}: {
  children: (form: ReturnType<typeof useForm<FormShape>>) => JSX.Element
}): JSX.Element {
  const form = useForm<FormShape>({
    defaultValues: { title: 'hello', x: 0.5, kind: 'panorama', enabled: false },
  })
  return (
    <ChakraProvider value={system}>
      <form>{children(form)}</form>
    </ChakraProvider>
  )
}

describe('RhfTextField', () => {
  it('reflects default value and updates on change', () => {
    render(
      <Harness>
        {(form) => <RhfTextField control={form.control} name="title" label="标题" />}
      </Harness>,
    )
    const input = screen.getByDisplayValue('hello') as HTMLInputElement
    expect(input).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'world' } })
    expect(input.value).toBe('world')
  })
})

describe('RhfNumberField', () => {
  it('renders the default numeric value', () => {
    render(
      <Harness>
        {(form) => (
          <RhfNumberField
            control={form.control}
            name="x"
            label="X 坐标"
            min={0}
            max={1}
            step={0.01}
            unit="×"
          />
        )}
      </Harness>,
    )
    const input = screen.getByDisplayValue('0.5') as HTMLInputElement
    expect(input).toBeInTheDocument()
  })
})

describe('RhfSelectField', () => {
  it('renders options and reflects the current value', () => {
    render(
      <Harness>
        {(form) => (
          <RhfSelectField
            control={form.control}
            name="kind"
            label="体验形式"
            options={[
              { value: 'panorama', label: '全景' },
              { value: 'html-scene', label: 'HTML 场景' },
            ]}
          />
        )}
      </Harness>,
    )
    const select = screen.getByDisplayValue('全景') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.options).toHaveLength(2)
  })
})

describe('RhfSwitchRow', () => {
  it('toggles the hidden checkbox state', () => {
    render(
      <Harness>
        {(form) => <RhfSwitchRow control={form.control} name="enabled" label="启用" />}
      </Harness>,
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })
})
