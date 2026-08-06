/**
 * Base class for domain errors. The central error handler translates any
 * thrown AppError into an HTTP response `{ statusCode, code, message }`
 * (see `src/plugins/error-handler.ts`).
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 'VALIDATION_ERROR', 400)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 'CONFLICT', 409)
  }
}

/**
 * The statement metadata is well formed but not enough to create the account
 * (e.g. no IBAN). 422 keeps it distinguishable from VALIDATION_ERROR (400).
 */
export class MissingAccountDataError extends AppError {
  constructor(message = 'Missing data to create the account') {
    super(message, 'MISSING_ACCOUNT_DATA', 422)
  }
}

export class DriveConnectionError extends AppError {
  constructor(message = 'Cannot reach Google Drive') {
    super(message, 'DRIVE_CONNECTION_ERROR', 503)
  }
}

export class UnknownBankError extends AppError {
  constructor(message = 'Unknown bank') {
    super(message, 'UNKNOWN_BANK', 404)
  }
}
