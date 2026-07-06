/**
 * App-level providers (Chakra, React Query, BrowserRouter, ErrorBoundary).
 * Mounted once in main.tsx; everything below the root uses these.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { system } from '../theme/system'
import { createQueryClient } from '../lib/query-client'
import { ErrorBoundary } from './error-boundary'

interface Props {
  children: ReactNode
}

export function AppProviders({ children }: Props): JSX.Element {
  // Single QueryClient per app instance; useState ensures stability across re-renders.
  const [queryClient] = useState(() => createQueryClient())

  return (
    <ErrorBoundary>
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>{children}</BrowserRouter>
        </QueryClientProvider>
      </ChakraProvider>
    </ErrorBoundary>
  )
}
