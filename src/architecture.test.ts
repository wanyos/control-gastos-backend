// Guardian test for whole-tree invariants (R4, R11, R12, R13 of
// specs/fundamentos). Lives at the root of src/ because it guards the tree,
// not a single file (conscious exception to "test next to the file").
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const srcDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'generated') continue
      files.push(...sourceFiles(fullPath))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('architecture invariants', () => {
  it('reads process.env only in src/config/env.ts', () => {
    const offenders = sourceFiles(srcDir)
      .filter((file) => relative(srcDir, file).replace(/\\/g, '/') !== 'config/env.ts')
      .filter((file) => readFileSync(file, 'utf8').includes('process.env'))
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('contains the target tree of docs/architecture.md (ADR-004)', () => {
    const expected = [
      'config/env.ts',
      'errors/app-error.ts',
      'lib/drive.ts',
      'lib/drive-structure.ts',
      'lib/drive-structure.test.ts',
      'plugins/drive.ts',
      'plugins/error-handler.ts',
      'modules/expenses/expenses.routes.ts',
      'modules/expenses/expenses.service.ts',
      'modules/expenses/expenses.schema.ts',
      'modules/expenses/expenses.types.ts',
      'modules/expenses/expenses.test.ts',
      'modules/health/health.routes.ts',
      'modules/health/health.test.ts',
      'modules/ingesta/ingesta.routes.ts',
      'modules/ingesta/ingesta.service.ts',
      'modules/ingesta/ingesta.types.ts',
      'modules/ingesta/ingesta.service.test.ts',
      'modules/ingesta/ingesta.routes.test.ts',
    ]

    const missing = expected.filter((file) => !existsSync(join(srcDir, file)))

    expect(missing).toEqual([])
  })

  it('has no src/routes/ directory (migrated to modules/)', () => {
    expect(existsSync(join(srcDir, 'routes'))).toBe(false)
  })

  it('keeps expenses.routes.ts free of data access (no "prisma" reference)', () => {
    const routes = readFileSync(join(srcDir, 'modules/expenses/expenses.routes.ts'), 'utf8')

    expect(routes.toLowerCase()).not.toContain('prisma')
  })

  it('.env.example lists the Drive variables with placeholders, not real credentials (R14)', () => {
    const envExample = readFileSync(join(srcDir, '..', '.env.example'), 'utf8')

    expect(envExample).toContain('GOOGLE_DRIVE_CLIENT_ID')
    expect(envExample).toContain('GOOGLE_DRIVE_CLIENT_SECRET')
    expect(envExample).toContain('GOOGLE_DRIVE_REFRESH_TOKEN')
    // No real-looking refresh token (1//...) nor client secret (GOCSPX-...).
    expect(envExample).not.toMatch(/1\/\/[A-Za-z0-9_-]{20,}/)
    expect(envExample).not.toMatch(/GOCSPX-[A-Za-z0-9_-]{10,}/)
  })

  it('keeps src/lib/drive.ts within the connection scope: no files.* surface (R17)', () => {
    const driveLib = readFileSync(join(srcDir, 'lib/drive.ts'), 'utf8')

    expect(driveLib).not.toContain('files.')
  })

  it('keeps src/lib/drive-structure.ts free of data access (no "prisma" reference) (R18)', () => {
    const driveStructure = readFileSync(join(srcDir, 'lib/drive-structure.ts'), 'utf8')

    expect(driveStructure.toLowerCase()).not.toContain('prisma')
  })

  it('keeps src/lib/drive-structure.ts free of Drive auth wiring, consuming the client (R19)', () => {
    const driveStructure = readFileSync(join(srcDir, 'lib/drive-structure.ts'), 'utf8')

    expect(driveStructure).not.toContain('createDriveClient')
    expect(driveStructure).not.toContain('createDriveAuth')
    expect(driveStructure).not.toContain('OAuth2')
  })

  it('keeps the ingesta module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/ingesta/ingesta.routes.ts',
      'modules/ingesta/ingesta.service.ts',
      'modules/ingesta/ingesta.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('gitignores the local Drive dump dir so bank data is never versioned (privacy)', () => {
    const gitignore = readFileSync(join(srcDir, '..', '.gitignore'), 'utf8')

    expect(gitignore).toContain('var/drive-read/')
  })
})
