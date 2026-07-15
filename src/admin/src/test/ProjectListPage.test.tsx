import './setup'

import { describe, expect, it, vi } from 'vitest'
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectListPage } from '../pages/ProjectListPage'
import { system } from '../theme/system'

vi.mock('../features/projects/api', () => ({
  useProjects: () => ({
    data: [{
      id: 'demo',
      title: '商业航天',
      version: '0.1.0',
      updatedAt: '2026-07-15T02:56:17.000Z',
      revision: 97,
    }],
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useCreateProject: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

function renderPage(): void {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProjectListPage />} />
          <Route path="/projects/:projectId/atlas-editor" element={<div>Atlas target</div>} />
          <Route path="/projects/:projectId/catalog-editor" element={<div>Catalog target</div>} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('ProjectListPage', () => {
  it('renders a semantic row whose only navigation controls are product links', async () => {
    const user = userEvent.setup()
    renderPage()

    const row = screen.getByTestId('project-row-demo')
    expect(row.tagName).toBe('TR')
    expect(row.querySelectorAll(':scope > td')).toHaveLength(6)
    expect(row.closest('a')).toBeNull()

    expect(screen.getByTestId('project-open-atlas-demo')).toHaveAttribute(
      'href',
      '/projects/demo/atlas-editor',
    )
    await user.click(screen.getByTestId('project-open-catalog-demo'))
    expect(screen.getByText('Catalog target')).toBeInTheDocument()
  })
})
