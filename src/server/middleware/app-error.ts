// ============================================================
// Interactive Guide - Application Error
// ============================================================
// Typed error for controlled HTTP error responses.
// Routes catch errors and convert to AppError, middleware formats.

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static notFound(message: string): AppError {
    return new AppError(message, 'NOT_FOUND', 404)
  }

  static validation(message: string): AppError {
    return new AppError(message, 'VALIDATION_ERROR', 400)
  }

  static config(message: string): AppError {
    return new AppError(message, 'CONFIG_ERROR', 400)
  }

  static internal(message: string): AppError {
    return new AppError(message, 'INTERNAL_ERROR', 500)
  }

  static aiService(message: string): AppError {
    return new AppError(message, 'AI_SERVICE_ERROR', 500)
  }

  static generateFailed(message: string): AppError {
    return new AppError(message, 'GENERATE_FAILED', 500)
  }
}
