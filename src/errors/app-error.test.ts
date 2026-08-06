import { describe, expect, it } from 'vitest'

import {
  AppError,
  ConflictError,
  DriveConnectionError,
  MissingAccountDataError,
  NotFoundError,
  UnknownBankError,
  ValidationError,
} from './app-error.js'

describe('AppError hierarchy', () => {
  it('AppError exposes message, code and statusCode (default 400)', () => {
    const error = new AppError('Something failed', 'SOMETHING_FAILED')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('Something failed')
    expect(error.code).toBe('SOMETHING_FAILED')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('AppError')
  })

  it('AppError accepts an explicit statusCode', () => {
    const error = new AppError('Conflict', 'CONFLICT', 409)

    expect(error.statusCode).toBe(409)
  })

  it('NotFoundError is an AppError with NOT_FOUND / 404', () => {
    const error = new NotFoundError('Expense not found')

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('Expense not found')
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('NotFoundError')
  })

  it('NotFoundError has a default message', () => {
    expect(new NotFoundError().message).toBe('Resource not found')
  })

  it('ValidationError is an AppError with VALIDATION_ERROR / 400', () => {
    const error = new ValidationError('amount is required')

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('amount is required')
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('ValidationError')
  })

  it('ValidationError has a default message', () => {
    expect(new ValidationError().message).toBe('Invalid request data')
  })

  it('ConflictError is an AppError with CONFLICT / 409', () => {
    const error = new ConflictError('An account with that iban already exists')

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('An account with that iban already exists')
    expect(error.code).toBe('CONFLICT')
    expect(error.statusCode).toBe(409)
    expect(error.name).toBe('ConflictError')
  })

  it('ConflictError has a default message', () => {
    expect(new ConflictError().message).toBe('Resource already exists')
  })

  it('MissingAccountDataError is an AppError with MISSING_ACCOUNT_DATA / 422', () => {
    const error = new MissingAccountDataError('Missing iban to create the account')

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('Missing iban to create the account')
    expect(error.code).toBe('MISSING_ACCOUNT_DATA')
    expect(error.statusCode).toBe(422)
    expect(error.name).toBe('MissingAccountDataError')
  })

  it('MissingAccountDataError has a default message', () => {
    expect(new MissingAccountDataError().message).toBe('Missing data to create the account')
  })

  it('DriveConnectionError is an AppError with DRIVE_CONNECTION_ERROR / 503', () => {
    const error = new DriveConnectionError('Drive OAuth credentials are not valid')

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('Drive OAuth credentials are not valid')
    expect(error.code).toBe('DRIVE_CONNECTION_ERROR')
    expect(error.statusCode).toBe(503)
    expect(error.name).toBe('DriveConnectionError')
  })

  it('DriveConnectionError has a default message', () => {
    expect(new DriveConnectionError().message).toBe('Cannot reach Google Drive')
  })

  it('UnknownBankError is an AppError with UNKNOWN_BANK / 404', () => {
    const error = new UnknownBankError("Unknown bank 'santender'")

    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe("Unknown bank 'santender'")
    expect(error.code).toBe('UNKNOWN_BANK')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('UnknownBankError')
  })

  it('UnknownBankError has a default message', () => {
    expect(new UnknownBankError().message).toBe('Unknown bank')
  })
})
