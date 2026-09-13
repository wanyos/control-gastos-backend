import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadEnvFileIfPresent } from './load-env-file.js'

// Variable names nobody else uses, so these tests cannot shadow real config.
const FROM_FILE = 'LOAD_ENV_FILE_TEST_FROM_FILE'
const ALREADY_SET = 'LOAD_ENV_FILE_TEST_ALREADY_SET'

describe('loadEnvFileIfPresent', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'load-env-file-'))
  })

  afterEach(() => {
    delete process.env[FROM_FILE]
    delete process.env[ALREADY_SET]
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads the variables of an existing file', () => {
    const file = join(dir, '.env')
    writeFileSync(file, `${FROM_FILE}=from-file\n`)

    expect(loadEnvFileIfPresent(file)).toBe(true)
    expect(process.env[FROM_FILE]).toBe('from-file')
  })

  it('does not overwrite a variable that already exists in the environment', () => {
    const file = join(dir, '.env')
    writeFileSync(file, `${ALREADY_SET}=from-file\n`)
    process.env[ALREADY_SET] = 'from-environment'

    loadEnvFileIfPresent(file)

    expect(process.env[ALREADY_SET]).toBe('from-environment')
  })

  it('does nothing and does not throw when the file does not exist', () => {
    expect(loadEnvFileIfPresent(join(dir, '.env'))).toBe(false)
    expect(process.env[FROM_FILE]).toBeUndefined()
  })

  it('rethrows any error other than a missing file', () => {
    // A directory called `.env`: it exists but cannot be read as a file.
    const notAFile = join(dir, '.env')
    mkdirSync(notAFile)

    expect(() => loadEnvFileIfPresent(notAFile)).toThrow()
  })
})
