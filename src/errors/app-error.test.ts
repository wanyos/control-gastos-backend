import { describe, expect, it } from 'vitest'

import { AppError, NotFoundError, ValidationError } from './app-error.js'

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
})
