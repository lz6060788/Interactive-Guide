import './setup'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideProject } from '@domain/project-types'
import { useProductExport } from '../features/product-export/useProductExport'

const fetchMock = vi.fn()
const replaceMock = vi.fn()
const closeMock = vi.fn()
const openMock = vi.fn(() => ({
  location: { replace: replaceMock },
  close: closeMock,
}))

describe('useProductExport', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    replaceMock.mockReset()
    closeMock.mockReset()
    openMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('open', openMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves, builds the selected product and navigates the synchronously opened window', async () => {
    const save = vi.fn(async () => ({ metadata: { revision: 12 } }) as GuideProject)
    fetchMock.mockResolvedValueOnce(buildResponse('atlas', 12))
    const { result } = renderHook(() =>
      useProductExport({
        projectId: 'project 1',
        product: 'atlas',
        currentRevision: 11,
        isDirty: true,
        save,
      }),
    )

    await act(async () => result.current.generatePreview())

    expect(openMock).toHaveBeenCalledWith('about:blank', '_blank')
    expect(save).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project%201/previews/atlas',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/api/atlas/index.html')
  })

  it('reuses a clean build for download without saving or rebuilding again', async () => {
    const save = vi.fn(async () => ({ metadata: { revision: 12 } }) as GuideProject)
    fetchMock.mockResolvedValueOnce(buildResponse('catalog', 12))
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result, rerender } = renderHook(
      ({ revision, dirty }) =>
        useProductExport({
          projectId: 'p1',
          product: 'catalog',
          currentRevision: revision,
          isDirty: dirty,
          save,
        }),
      { initialProps: { revision: 11, dirty: true } },
    )

    await act(async () => result.current.generatePreview())
    rerender({ revision: 12, dirty: false })
    await act(async () => result.current.downloadZip())

    expect(save).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(anchorClick).toHaveBeenCalledTimes(1)
    anchorClick.mockRestore()
  })
})

function buildResponse(product: 'atlas' | 'catalog', sourceRevision: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        product,
        buildId: `${product}-1`,
        sourceRevision,
        entryUrl: `/api/${product}/index.html`,
        downloadUrl: `/api/${product}/download.zip`,
      },
    }),
  } as Response
}
