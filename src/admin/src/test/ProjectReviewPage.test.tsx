import './setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectReviewPage } from '../pages/ProjectReviewPage'
import { ApiError } from '../lib/api-client'
import { system } from '../theme/system'

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  useReviewSession: vi.fn(),
  useApproveReviewSession: vi.fn(),
  approve: vi.fn(),
  refetchProject: vi.fn(),
  refetchReview: vi.fn(),
}))

vi.mock('../features/projects/api', () => ({ useProject: mocks.useProject }))
vi.mock('../features/review/api', () => ({
  useReviewSession: mocks.useReviewSession,
  useApproveReviewSession: mocks.useApproveReviewSession,
}))

const pendingSession = {
  schemaVersion: '1.0.0',
  id: 'review-00000000-0000-4000-8000-000000000000',
  projectId: 'demo',
  status: 'pending',
  openedRevision: 3,
  currentRevision: 5,
  openedAt: '2026-07-21T01:00:00.000Z',
  reviewPath: '/projects/demo/review/review-00000000-0000-4000-8000-000000000000',
  reviewUrl:
    'http://127.0.0.1:8788/projects/demo/review/review-00000000-0000-4000-8000-000000000000',
} as const

beforeEach(() => {
  mocks.approve.mockReset()
  mocks.refetchProject.mockReset()
  mocks.refetchReview.mockReset()
  mocks.useProject.mockReturnValue({
    data: { id: 'demo', metadata: { revision: 5, updatedAt: '2026-07-21T02:00:00.000Z' } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.refetchProject,
  })
  mocks.useReviewSession.mockReturnValue({
    data: pendingSession,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.refetchReview,
  })
  mocks.useApproveReviewSession.mockReturnValue({
    mutateAsync: mocks.approve,
    isPending: false,
  })
})

function renderPage(path: string = pendingSession.reviewPath): void {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/:projectId/review/:reviewId" element={<ProjectReviewPage />} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('ProjectReviewPage', () => {
  it('approves the current revision after linking to both product editors', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('link', { name: '打开 Atlas' })).toHaveAttribute(
      'href',
      '/projects/demo/atlas-editor',
    )
    expect(screen.getByRole('link', { name: '打开 Catalog' })).toHaveAttribute(
      'href',
      '/projects/demo/catalog-editor',
    )
    await user.type(screen.getByRole('textbox'), '两个产物均已检查')
    await user.click(screen.getByTestId('approve-review'))

    expect(mocks.approve).toHaveBeenCalledWith({
      expectedRevision: 5,
      notes: '两个产物均已检查',
    })
  })

  it('renders an immutable stale approval without allowing another approval', () => {
    mocks.useReviewSession.mockReturnValue({
      data: {
        ...pendingSession,
        status: 'stale',
        approvedRevision: 4,
        approvedProjectSha256: 'a'.repeat(64),
        hashAlgorithm: 'sha256-stable-json-v1',
        approvedAt: '2026-07-21T01:30:00.000Z',
        staleReason: 'REVISION_CHANGED',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mocks.refetchReview,
    })
    renderPage()

    expect(screen.getByText('项目在确认后被修改')).toBeInTheDocument()
    expect(screen.getByTestId('approve-review')).toBeDisabled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('fails closed when the route project does not own the review session', () => {
    renderPage(pendingSession.reviewPath.replace('/projects/demo/', '/projects/other/'))

    expect(screen.getByText('无法进入本次校验')).toBeInTheDocument()
    expect(screen.queryByTestId('approve-review')).not.toBeInTheDocument()
  })

  it('shows asset integrity failures instead of disguising them as a revision refresh', async () => {
    mocks.approve.mockRejectedValue(
      new ApiError(
        409,
        'ASSET_INTEGRITY_FAILED',
        undefined,
        'asset "asset-pano" failed integrity validation: referenced path is missing',
      ),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('approve-review'))

    expect(screen.getByText(/asset-pano.*referenced path is missing/)).toBeInTheDocument()
  })
})
