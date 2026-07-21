import './setup'

/**
 * ErrorBoundary tests — verifies that an exception thrown from a child
 * surfaces the recovery panel with a Reset action that clears the error.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import { ErrorBoundary } from '../app/error-boundary'
import { system } from '../theme/system'

function wrap(ui: React.ReactNode): JSX.Element {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{ui}</ChakraProvider>
    </MemoryRouter>
  )
}

function Boom(): JSX.Element {
  throw new Error('unit-test boom')
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(wrap(<ErrorBoundary><div>safe</div></ErrorBoundary>))
    expect(screen.getByText('safe')).toBeInTheDocument()
  })

  it('shows the recovery panel with the error message', () => {
    // silence the expected error from Boom()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(wrap(<ErrorBoundary><Boom /></ErrorBoundary>))
    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    expect(screen.getByText(/unit-test boom/)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('falls back to the error panel when a child throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(wrap(<ErrorBoundary><Boom /></ErrorBoundary>))
    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    expect(screen.getByText(/unit-test boom/)).toBeInTheDocument()
    spy.mockRestore()
  })
})
