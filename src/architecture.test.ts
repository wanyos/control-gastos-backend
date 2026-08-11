// Guardian test for whole-tree invariants (R4, R11, R12, R13 of
// specs/fundamentos). Lives at the root of src/ because it guards the tree,
// not a single file (conscious exception to "test next to the file").
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { normalizeBankName } from './lib/drive-structure.js'

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
      // The parsed-movement contract every bank parser returns (feature 11):
      // shared shape, never shared format-reading code.
      'lib/parsed-statement.ts',
      'lib/parsed-statement.test.ts',
      'plugins/drive.ts',
      'plugins/error-handler.ts',
      'modules/accounts/accounts.routes.ts',
      'modules/accounts/accounts.service.ts',
      'modules/accounts/accounts.schema.ts',
      'modules/accounts/accounts.types.ts',
      'modules/accounts/accounts.test.ts',
      'modules/categories/categories.routes.ts',
      'modules/categories/categories.service.ts',
      'modules/categories/categories.schema.ts',
      'modules/categories/categories.types.ts',
      'modules/categories/categories.test.ts',
      // movements has no *.schema.ts on purpose: it is read-only, there is no
      // body to validate (specs/data-model/design.md §5).
      'modules/movements/movements.routes.ts',
      'modules/movements/movements.service.ts',
      'modules/movements/movements.types.ts',
      'modules/movements/movements.test.ts',
      'modules/health/health.routes.ts',
      'modules/health/health.test.ts',
      'modules/ingesta/ingesta.routes.ts',
      'modules/ingesta/ingesta.service.ts',
      'modules/ingesta/ingesta.types.ts',
      'modules/ingesta/ingesta.service.test.ts',
      'modules/ingesta/ingesta.routes.test.ts',
      'modules/bankinter/bankinter.parser.ts',
      'modules/bankinter/bankinter.service.ts',
      'modules/bankinter/bankinter.routes.ts',
      'modules/bankinter/bankinter.types.ts',
      'modules/bankinter/bankinter.parser.test.ts',
      'modules/bankinter/bankinter.service.test.ts',
      'modules/bankinter/bankinter.routes.test.ts',
      // Second bank with its own parser module (feature 10): same pattern, its
      // own format-reading code, the same shared output contract.
      'modules/myinvestor/myinvestor.format.ts',
      'modules/myinvestor/myinvestor.statement.parser.ts',
      'modules/myinvestor/myinvestor.service.ts',
      'modules/myinvestor/myinvestor.routes.ts',
      'modules/myinvestor/myinvestor.types.ts',
      'modules/myinvestor/myinvestor.fixture.ts',
      'modules/myinvestor/myinvestor.format.test.ts',
      'modules/myinvestor/myinvestor.statement.parser.test.ts',
      'modules/myinvestor/myinvestor.service.test.ts',
      'modules/myinvestor/myinvestor.routes.test.ts',
      // investments is a partial folder on purpose: feature 9 is schema plus
      // migration, with no HTTP surface (no routes/service/schema/types).
      // Precedent: modules/health/. The importer feature will add its service
      // here, so this list only grows: it checks that a file exists, never that
      // it is the only one.
      'modules/investments/investments.model.test.ts',
    ]

    const missing = expected.filter((file) => !existsSync(join(srcDir, file)))

    expect(missing).toEqual([])
  })

  it('has no src/routes/ directory (migrated to modules/)', () => {
    expect(existsSync(join(srcDir, 'routes'))).toBe(false)
  })

  it('has no src/modules/expenses/ directory (replaced by the flow model)', () => {
    expect(existsSync(join(srcDir, 'modules/expenses'))).toBe(false)
  })

  it('keeps the flow module routes free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/accounts/accounts.routes.ts',
      'modules/categories/categories.routes.ts',
      'modules/movements/movements.routes.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the movements module read-only (no create/delete/transfer surface)', () => {
    const files = [
      'modules/movements/movements.routes.ts',
      'modules/movements/movements.service.ts',
    ]

    for (const file of files) {
      const source = readFileSync(join(srcDir, file), 'utf8')
      expect(source).not.toContain('createMovement')
      expect(source).not.toContain('deleteMovement')
      expect(source).not.toContain('createTransfer')
    }
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

  it('keeps the bankinter parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/bankinter/bankinter.parser.ts',
      'modules/bankinter/bankinter.service.ts',
      'modules/bankinter/bankinter.routes.ts',
      'modules/bankinter/bankinter.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the myinvestor parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/myinvestor/myinvestor.format.ts',
      'modules/myinvestor/myinvestor.statement.parser.ts',
      'modules/myinvestor/myinvestor.service.ts',
      'modules/myinvestor/myinvestor.routes.ts',
      'modules/myinvestor/myinvestor.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('shares no parsing code between bank modules (one parser per bank)', () => {
    const bankModules = ['bankinter', 'myinvestor']
    const myinvestorDir = join(srcDir, 'modules/myinvestor')
    // What a bank module may import: vendor/node, its own files, the shared
    // error classes, `lib/` (the output contract) and the single sign helper of
    // `modules/movements/`, which is NOT a bank module.
    const allowedRelative = ['./', '../../errors/', '../../lib/', '../movements/']

    const forbiddenImports = sourceFiles(myinvestorDir)
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)]
          .map((match) => match[1])
          .filter(
            (specifier) =>
              specifier.startsWith('.') &&
              !allowedRelative.some((prefix) => specifier.startsWith(prefix)),
          )
          .map((specifier) => `${relative(srcDir, file)} -> ${specifier}`),
      )
      .sort()

    expect(forbiddenImports).toEqual([])

    // And no other bank module reaches into it. `app.ts` is the composition
    // root and registers every module: it is the single expected importer.
    const outsideImporters = sourceFiles(srcDir)
      .filter(
        (file) => !relative(srcDir, file).replace(/\\/g, '/').startsWith('modules/myinvestor/'),
      )
      .filter((file) => readFileSync(file, 'utf8').includes('myinvestor'))
      .map((file) => relative(srcDir, file).replace(/\\/g, '/'))

    expect(outsideImporters).toEqual(['app.ts'])
    // Neither bank module names the other one.
    for (const bank of bankModules) {
      const others = bankModules.filter((name) => name !== bank)
      for (const file of sourceFiles(join(srcDir, 'modules', bank))) {
        const source = readFileSync(file, 'utf8')
        for (const other of others) {
          expect(source).not.toContain(`modules/${other}`)
          expect(source).not.toContain(`../${other}/`)
        }
      }
    }
  })

  it('normalizes the bank name to the slug of its Drive folder and its module', () => {
    expect(normalizeBankName('MyInvestor')).toBe('myinvestor')
    expect(existsSync(join(srcDir, 'modules', normalizeBankName('MyInvestor')))).toBe(true)
  })

  it('declares the parsed movement contract in ONE module only (feature 11)', () => {
    const contract = 'lib/parsed-statement.ts'
    const declarations = [
      /(?:interface|type)\s+ParsedMovement\b/,
      /(?:interface|type)\s+UnparsedRow\b/,
      /(?:interface|type)\s+ParsedMovementType\b/,
    ]

    const offenders = sourceFiles(srcDir)
      .filter((file) => relative(srcDir, file).replace(/\\/g, '/') !== contract)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return declarations.some((declaration) => declaration.test(source))
      })
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('keeps the contract free of database and bank-specific knowledge (feature 11)', () => {
    const contract = readFileSync(join(srcDir, 'lib/parsed-statement.ts'), 'utf8')

    // It is derived from the data model, but it is NOT the data model.
    expect(contract.toLowerCase()).not.toContain('prisma')
    expect(contract).not.toContain('accountId')
    expect(contract).not.toContain('transferId')
    expect(contract).not.toContain('origin')
    // And it is not a shared parser: it imports nothing (no bank module, no
    // spreadsheet library), so no format-reading code can live here.
    expect(contract).not.toMatch(/^\s*import\s/m)
  })

  it('takes the income/expense/neutral decision in a single place (feature 11)', () => {
    const parsers = sourceFiles(join(srcDir, 'modules')).filter((file) =>
      file.endsWith('.parser.ts'),
    )

    expect(parsers.length).toBeGreaterThan(0)
    for (const parser of parsers) {
      const source = readFileSync(parser, 'utf8')
      expect(source).toContain('deriveMovementTypeFromAmount')
      // No parser re-implements the sign rule (this is what used to say
      // `amount < 0 ? 'expense' : 'income'`).
      expect(source).not.toMatch(/amount\s*[<>]=?\s*0\s*\?/)
    }
  })

  it('gitignores the local Drive dump dir so bank data is never versioned (privacy)', () => {
    const gitignore = readFileSync(join(srcDir, '..', '.gitignore'), 'utf8')

    expect(gitignore).toContain('var/drive-read/')
  })

  it('gitignores the local parser dump dir so parsed bank data is never versioned (privacy)', () => {
    const gitignore = readFileSync(join(srcDir, '..', '.gitignore'), 'utf8')

    expect(gitignore).toContain('var/parsed/')
  })
})

// The bootstrap placeholder is gone (feature 8, breaking change): its routes
// must fall through to the central 404 handler. It lives here, next to the
// tree guardian, because the module it belonged to no longer exists.
describe('retired /api/expenses surface and bootstrap tables (R34, R35)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/expenses returns 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/expenses' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('POST /api/expenses returns 404', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      payload: { description: 'Weekly groceries', amount: 45.9 },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('GET /api/expenses/1 returns 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/expenses/1' })

    expect(response.statusCode).toBe(404)
  })

  it('the Expense table no longer exists in the database (R35)', async () => {
    const tables = await app.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('Expense')
    `

    expect(tables).toEqual([])
  })

  it('the Category table is the new one, not the bootstrap placeholder (R35)', async () => {
    const columns = await app.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Category'
    `
    const names = columns.map((column) => column.column_name)

    expect(names).toContain('kind')
    expect(names).toContain('parentId')
  })
})
