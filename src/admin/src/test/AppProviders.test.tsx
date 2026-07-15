import './setup'

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProviders } from '../app/providers'

function Boom(): JSX.Element {
  throw new Error('provider child failure')
}

describe('AppProviders', () => {
  it('gives the ErrorBoundary fallback both Chakra and Router context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppProviders>
        <Boom />
      </AppProviders>,
    )

    expect(screen.getByText(/provider child failure/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    spy.mockRestore()
  })
})
