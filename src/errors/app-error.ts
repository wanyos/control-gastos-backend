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

/**
 * The IBAN of an account is not an IBAN: wrong shape, wrong length for its
 * country, or check digits that do not add up (feature 21). It is a rejection,
 * never a repair — the same doctrine as `NotUtf8Error`: storing a mistyped IBAN
 * creates a SECOND account for an account that already exists, in silence, and
 * the movements land in the wrong place.
 *
 * 422, like the other errors of a well-formed request carrying an unusable
 * datum: through a bank file it travels inside `files[].error` of a 200; through
 * `POST /api/accounts` it is the body of the response.
 */
export class InvalidIbanError extends AppError {
  constructor(message = 'Invalid IBAN') {
    super(message, 'INVALID_IBAN', 422)
  }
}

/**
 * The bytes of a file are not valid UTF-8 (typically saved as cp1252/ANSI by an
 * editor). It is a rejection, never a repair: decoding it anyway would silently
 * turn every accent into `U+FFFD` and store corrupted text. 422 keeps it apart
 * from VALIDATION_ERROR (400): the file is a well-formed request, its bytes are
 * what cannot be read.
 */
export class NotUtf8Error extends AppError {
  constructor(message = 'File is not valid UTF-8') {
    super(message, 'NOT_UTF8', 422)
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
