/**
 * Unified API client for the admin frontend.
 *
 * All server communication goes through apiFetch(). It:
 *   - Throws ApiError (with status / code / issues) on non-2xx so callers
 *     can branch on status (e.g. 404 → notFound, 409 → revision conflict)
 *   - Auto-unwraps the { data: ... } envelope used by the Express backend
 *   - Sends x-expected-revision for optimistic-lock writes
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly issues?: unknown,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ApiError'
  }
}

interface ApiFetchInit extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown
  headers?: Record<string, string>
  expectedRevision?: number
}

export async function apiFetch<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
): Promise<T> {
  const { body, headers, expectedRevision, ...rest } = init
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(expectedRevision !== undefined && {
      'x-expected-revision': String(expectedRevision),
    }),
    ...headers,
  }

  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null) as
      | { error?: string; code?: string; issues?: unknown }
      | null
    throw new ApiError(
      res.status,
      errorBody?.code ?? errorBody?.error ?? `HTTP_${res.status}`,
      errorBody?.issues,
      errorBody?.error,
    )
  }

  if (res.status === 204) return undefined as T
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data
  }
  return json as T
}
