import { describe, expect, it } from 'vitest'

import { loadConfig } from './env.js'

const databaseUrl = 'postgresql://postgres:postgres@localhost:5434/gastos?schema=public'

describe('loadConfig', () => {
  it('builds a typed config from a complete environment', () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      PORT: '4000',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
    })

    expect(config).toEqual({
      databaseUrl,
      port: 4000,
      host: '127.0.0.1',
      logLevel: 'debug',
    })
  })

  it('applies defaults when only DATABASE_URL is present', () => {
    const config = loadConfig({ DATABASE_URL: databaseUrl })

    expect(config).toEqual({
      databaseUrl,
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
    })
  })

  it('accepts LOG_LEVEL=silent (used by the test suite)', () => {
    const config = loadConfig({ DATABASE_URL: databaseUrl, LOG_LEVEL: 'silent' })

    expect(config.logLevel).toBe('silent')
  })

  it('throws naming DATABASE_URL when it is missing', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/)
  })

  it('throws naming DATABASE_URL when it is empty', () => {
    expect(() => loadConfig({ DATABASE_URL: '' })).toThrowError(/DATABASE_URL/)
  })

  it('throws naming PORT when it is not an integer', () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, PORT: 'abc' })).toThrowError(/PORT/)
  })

  it('throws naming PORT when it is out of range', () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, PORT: '0' })).toThrowError(/PORT/)
  })

  it('throws naming LOG_LEVEL when the level is unknown', () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, LOG_LEVEL: 'verbose' })).toThrowError(
      /LOG_LEVEL/,
    )
  })

  it('collects all problems into a single error message', () => {
    expect(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrowError(
      /DATABASE_URL[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    )
  })
})
