// ============================================================
// Interactive Guide - Global Error Handler Middleware
// ============================================================
// Catches all errors thrown in route handlers and services.
// Formats response as { error, code } — never leaks stack traces.

import type { Request, Response, NextFunction } from 'express'
import { AppError } from './app-error.js'

// Express error handler middleware must have 4 parameters
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }

  // Unknown error — don't leak internals
  console.error('[Error]', err)
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
}
