import './setup'

/**
 * api-client tests — verifies the unified fetch wrapper handles status
 * codes, envelopes, and the x-expected-revision header correctly.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, ApiError } from '../lib/api-client'

const fetchMock = vi.fn()

describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('unwraps { data: ... } envelopes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'abc', title: 'x' } }),
    } as Response)
    const result = await apiFetch<{ id: string }>('/projects/abc')
    expect(result.id).toBe('abc')
  })

  it('returns raw body when no envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'abc' }),
    } as Response)
    const result = await apiFetch<{ id: string }>('/health')
    expect(result.id).toBe('abc')
  })

  it('serializes JSON bodies and sets Content-Type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    } as Response)
    await apiFetch('/x', { method: 'POST', body: { foo: 1 } })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ foo: 1 })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
  })

  it('sends x-expected-revision header when provided', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    } as Response)
    await apiFetch('/x', { method: 'PUT', body: {}, expectedRevision: 42 })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['x-expected-revision']).toBe('42')
  })

  it('throws ApiError with status and code on non-2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: 'NOT_FOUND', error: 'no such project' }),
    } as Response)
    let captured: ApiError | null = null
    try {
      await apiFetch('/projects/missing')
    } catch (e) {
      captured = e as ApiError
    }
    expect(captured).toBeInstanceOf(ApiError)
    expect(captured!.status).toBe(404)
    expect(captured!.code).toBe('NOT_FOUND')
  })

  it('throws ApiError with status 409 on revision conflict', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'REVISION_CONFLICT',
        error: 'revision mismatch',
        issues: { expected: 1, actual: 2 },
      }),
    } as Response)
    try {
      await apiFetch('/projects/abc/products/atlas', { method: 'PUT', body: {} })
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(409)
      expect(err.issues).toEqual({ expected: 1, actual: 2 })
    }
  })

  it('returns undefined for HTTP 204', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => undefined,
    } as unknown as Response)
    const result = await apiFetch('/x')
    expect(result).toBeUndefined()
  })

  it('uses HTTP_<status> code when error body is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('no body')
      },
    } as unknown as Response)
    try {
      await apiFetch('/x')
    } catch (e) {
      expect((e as ApiError).code).toBe('HTTP_500')
    }
  })
})
