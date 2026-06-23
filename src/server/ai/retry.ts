// ============================================================
// Interactive Guide - Retry Utility
// ============================================================
// Exponential backoff retry for transient AI API failures.
// Retries on: network errors, 5xx, 429 (rate limit).
// Does NOT retry on: 4xx (bad request / auth / not found).

export interface RetryConfig {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  backoffFactor: 2,
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return true
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return false
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('network') ||
      msg.includes('socket') ||
      msg.includes('dns')
    ) {
      return true
    }
    if (msg.includes('5') && (msg.includes('status') || msg.includes('http'))) {
      return true
    }
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  config?: RetryConfig,
): Promise<T> {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffFactor } = {
    ...DEFAULT_CONFIG,
    ...config,
  }
  const onRetry = config?.onRetry

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastError = err

      if (attempt === maxRetries) break

      if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status: number }).status
        if (!isRetryableStatus(status)) throw err
      } else if (!isRetryableError(err)) {
        throw err
      }

      const retryDelay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt), maxDelayMs)
      const jitter = Math.random() * 200

      console.warn(
        `[Retry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(retryDelay + jitter)}ms:`,
        err instanceof Error ? err.message : String(err),
      )

      if (onRetry) {
        onRetry(attempt + 1, err instanceof Error ? err : new Error(String(err)), retryDelay + jitter)
      }

      await delay(retryDelay + jitter)
    }
  }

  throw lastError
}
