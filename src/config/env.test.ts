import { describe, expect, it } from 'vitest'

import { loadConfig } from './env.js'

const databaseUrl = 'postgresql://postgres:postgres@localhost:5434/gastos?schema=public'

// The three Drive credentials are now required, so every valid environment must
// carry them. `driveEnv` is the raw env shape; `drive` is the typed config shape.
const driveEnv = {
  GOOGLE_DRIVE_CLIENT_ID: 'client-id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
}

const drive = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
}

// The Drive root folder id is required too, but it is NOT a credential: it lives
// as a sibling of `drive` in the config, so it is kept as its own constant.
const driveRootFolderId = 'root-folder-id'

const baseEnv = {
  DATABASE_URL: databaseUrl,
  ...driveEnv,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: driveRootFolderId,
}

describe('loadConfig', () => {
  it('builds a typed config from a complete environment', () => {
    const config = loadConfig({
      ...driveEnv,
      DATABASE_URL: databaseUrl,
      GOOGLE_DRIVE_ROOT_FOLDER_ID: driveRootFolderId,
      PORT: '4000',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
    })

    expect(config).toEqual({
      databaseUrl,
      port: 4000,
      host: '127.0.0.1',
      logLevel: 'debug',
      drive,
      driveRootFolderId,
    })
  })

  it('applies defaults when only the required variables are present', () => {
    const config = loadConfig(baseEnv)

    expect(config).toEqual({
      databaseUrl,
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
      drive,
      driveRootFolderId,
    })
  })

  it('accepts LOG_LEVEL=silent (used by the test suite)', () => {
    const config = loadConfig({ ...baseEnv, LOG_LEVEL: 'silent' })

    expect(config.logLevel).toBe('silent')
  })

  it('exposes the three Drive credentials under config.drive', () => {
    const config = loadConfig(baseEnv)

    expect(config.drive).toEqual(drive)
  })

  it('exposes the Drive root folder id under config.driveRootFolderId', () => {
    const config = loadConfig(baseEnv)

    expect(config.driveRootFolderId).toBe(driveRootFolderId)
  })

  it('throws naming DATABASE_URL when it is missing', () => {
    expect(() => loadConfig({ ...driveEnv })).toThrowError(/DATABASE_URL/)
  })

  it('throws naming DATABASE_URL when it is empty', () => {
    expect(() => loadConfig({ ...driveEnv, DATABASE_URL: '' })).toThrowError(/DATABASE_URL/)
  })

  it('throws naming PORT when it is not an integer', () => {
    expect(() => loadConfig({ ...baseEnv, PORT: 'abc' })).toThrowError(/PORT/)
  })

  it('throws naming PORT when it is out of range', () => {
    expect(() => loadConfig({ ...baseEnv, PORT: '0' })).toThrowError(/PORT/)
  })

  it('throws naming LOG_LEVEL when the level is unknown', () => {
    expect(() => loadConfig({ ...baseEnv, LOG_LEVEL: 'verbose' })).toThrowError(/LOG_LEVEL/)
  })

  it('throws naming GOOGLE_DRIVE_CLIENT_ID when it is missing', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
      }),
    ).toThrowError(/GOOGLE_DRIVE_CLIENT_ID/)
  })

  it('throws naming GOOGLE_DRIVE_CLIENT_SECRET when it is missing', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        GOOGLE_DRIVE_CLIENT_ID: 'client-id',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
      }),
    ).toThrowError(/GOOGLE_DRIVE_CLIENT_SECRET/)
  })

  it('throws naming GOOGLE_DRIVE_REFRESH_TOKEN when it is missing', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        GOOGLE_DRIVE_CLIENT_ID: 'client-id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
      }),
    ).toThrowError(/GOOGLE_DRIVE_REFRESH_TOKEN/)
  })

  it('names every missing Drive variable in a single error message', () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl })).toThrowError(
      /GOOGLE_DRIVE_CLIENT_ID[\s\S]*GOOGLE_DRIVE_CLIENT_SECRET[\s\S]*GOOGLE_DRIVE_REFRESH_TOKEN/,
    )
  })

  it('throws naming GOOGLE_DRIVE_ROOT_FOLDER_ID when it is missing', () => {
    // baseEnv minus the root folder id: everything else valid.
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, ...driveEnv })).toThrowError(
      /GOOGLE_DRIVE_ROOT_FOLDER_ID/,
    )
  })

  it('throws naming GOOGLE_DRIVE_ROOT_FOLDER_ID when it is empty', () => {
    expect(() => loadConfig({ ...baseEnv, GOOGLE_DRIVE_ROOT_FOLDER_ID: '' })).toThrowError(
      /GOOGLE_DRIVE_ROOT_FOLDER_ID/,
    )
  })

  it('lists GOOGLE_DRIVE_ROOT_FOLDER_ID alongside the other missing problems', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrowError(
      /DATABASE_URL[\s\S]*PORT[\s\S]*GOOGLE_DRIVE_ROOT_FOLDER_ID/,
    )
  })

  it('collects all problems into a single error message', () => {
    expect(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrowError(
      /DATABASE_URL[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    )
  })

  it('lists the missing Drive variables alongside the preexisting ones', () => {
    expect(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrowError(
      /GOOGLE_DRIVE_CLIENT_ID[\s\S]*GOOGLE_DRIVE_CLIENT_SECRET[\s\S]*GOOGLE_DRIVE_REFRESH_TOKEN/,
    )
  })
})
