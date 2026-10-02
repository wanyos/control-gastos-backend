// Guardian test for whole-tree invariants (R4, R11, R12, R13 of
// specs/02-foundations). Lives at the root of src/ because it guards the tree,
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
      // The strict UTF-8 decoding every file goes through (feature 17): it is
      // encoding, not format reading, so it is shared and not per bank.
      'lib/utf8.ts',
      'lib/utf8.test.ts',
      // The encoding a BANK emits, decoded with its own table (feature 19,
      // ADR-022): same reasoning as `utf8.ts` — encoding is not format.
      'lib/cp1252.ts',
      'lib/cp1252.test.ts',
      // The single normalizer+validator of an IBAN (feature 21): it is the ISO
      // identifier of an account, not the format of any bank, so it is shared
      // by the three banks and by POST /api/accounts.
      'lib/iban.ts',
      'lib/iban.test.ts',
      // The throwaway database every test worker runs against (feature 27,
      // ADR-027). It lives in `lib/` and not at the root of the repo because it
      // is type-checked and tested like any other module -- and because the two
      // guardians it holds (a leftover row, a change in HIS database) are the
      // only thing standing between the suite and his data.
      'lib/test-db.ts',
      'lib/test-db.test.ts',
      // Loads the .env with Node's process.loadEnvFile(), ignoring only a
      // missing file. Imported first by src/server.ts, and first setupFile of
      // vitest.config.ts: before vitest.setup.ts rewrites DATABASE_URL.
      'lib/load-env-file.ts',
      'lib/load-env-file.test.ts',
      // The Drive double of the tests that import through `importPending`
      // (feature 52): a fixture, next to `iban.fixture.ts`.
      'lib/drive.fixture.ts',
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
      // movements is still read-only (no body to validate), but since feature
      // 36 its listing takes a querystring, and that is what its schema file
      // validates (specs/08-data-model/design.md §5).
      'modules/movements/movements.routes.ts',
      'modules/movements/movements.schema.ts',
      'modules/movements/movements.service.ts',
      'modules/movements/movements.types.ts',
      'modules/movements/movements.test.ts',
      'modules/health/health.routes.ts',
      'modules/health/health.test.ts',
      // Renamed to English in feature 12 (docs/conventions.md §Idioma): the
      // module and its routes were the last Spanish names in src/.
      'modules/ingestion/ingestion.routes.ts',
      'modules/ingestion/ingestion.service.ts',
      'modules/ingestion/ingestion.types.ts',
      'modules/ingestion/ingestion.service.test.ts',
      'modules/ingestion/ingestion.routes.test.ts',
      // The importer (feature 12): the seam between Drive, the parsers and the
      // database. It is not a bank module and it is not the ingestion.
      'modules/import/import.types.ts',
      'modules/import/import.service.ts',
      'modules/import/import.routes.ts',
      'modules/import/import.service.test.ts',
      'modules/import/import.routes.test.ts',
      // The logic of `pnpm run parse-file` (feature 52): one file through the
      // parser of its bank, summarized as counts and shape, storing nothing.
      'modules/import/import.parse-file.ts',
      'modules/import/import.parse-file.test.ts',
      // Since feature 52 a bank module is its parser, its format readers, its
      // fixtures and their tests: no route and no walk over files on disk.
      'modules/bankinter/bankinter.parser.ts',
      'modules/bankinter/bankinter.types.ts',
      'modules/bankinter/bankinter.parser.test.ts',
      // Second bank with its own parser module (feature 10): same pattern, its
      // own format-reading code, the same shared output contract.
      'modules/myinvestor/myinvestor.format.ts',
      'modules/myinvestor/myinvestor.statement.parser.ts',
      // What is left of this file is the adapter of the product registry.
      'modules/myinvestor/myinvestor.service.ts',
      'modules/myinvestor/myinvestor.types.ts',
      'modules/myinvestor/myinvestor.fixture.ts',
      // Second ENTRY of the same bank (feature 13): the hand-written product
      // files. Same module, its own format-reading code (ADR-016).
      'modules/myinvestor/myinvestor.product.parser.ts',
      'modules/myinvestor/myinvestor.product.parser.test.ts',
      'modules/myinvestor/myinvestor.format.test.ts',
      'modules/myinvestor/myinvestor.statement.parser.test.ts',
      'modules/myinvestor/myinvestor.service.test.ts',
      // Third bank with its own parser module (feature 18): the first file of
      // the repo that is a REAL quoted CSV, so it brings its own reader — which
      // stays inside the bank folder, like every other piece of format reading.
      'modules/n26/n26.csv.ts',
      'modules/n26/n26.format.ts',
      'modules/n26/n26.statement.parser.ts',
      'modules/n26/n26.types.ts',
      'modules/n26/n26.fixture.ts',
      'modules/n26/n26.csv.test.ts',
      'modules/n26/n26.format.test.ts',
      'modules/n26/n26.statement.parser.test.ts',
      'modules/n26/n26.registry.test.ts',
      // Fourth bank with its own parser module (feature 19): its file is called
      // `.xls` and is an HTML page, so it brings its own HTML reader — which
      // stays inside the bank folder, like every other piece of format reading.
      'modules/openbank/openbank.html.ts',
      'modules/openbank/openbank.format.ts',
      'modules/openbank/openbank.statement.parser.ts',
      'modules/openbank/openbank.types.ts',
      'modules/openbank/openbank.fixture.ts',
      'modules/openbank/openbank.html.test.ts',
      'modules/openbank/openbank.format.test.ts',
      'modules/openbank/openbank.statement.parser.test.ts',
      'modules/openbank/openbank.registry.test.ts',
      // Sixth bank with its own parser module (feature 46): a CSV of commas that
      // may carry quotes, so it brings its own reader inside its folder.
      'modules/revolut/revolut.csv.ts',
      'modules/revolut/revolut.format.ts',
      'modules/revolut/revolut.statement.parser.ts',
      'modules/revolut/revolut.types.ts',
      'modules/revolut/revolut.fixture.ts',
      'modules/revolut/revolut.csv.test.ts',
      'modules/revolut/revolut.format.test.ts',
      'modules/revolut/revolut.statement.parser.test.ts',
      'modules/revolut/revolut.registry.test.ts',
      'modules/revolut/revolut.import.test.ts',
      // Fifth bank with its own module (feature 20, ADR-024), and the first one
      // that enters WITHOUT a parser of what the bank emits: its statement is a
      // `.pdf` that is never opened, and the entry is a `.json` the human writes.
      'modules/trade-republic/trade-republic.product.parser.ts',
      // What is left of this file is the adapter of the product registry.
      'modules/trade-republic/trade-republic.service.ts',
      'modules/trade-republic/trade-republic.types.ts',
      'modules/trade-republic/trade-republic.fixture.ts',
      'modules/trade-republic/trade-republic.product.parser.test.ts',
      'modules/trade-republic/trade-republic.service.test.ts',
      'modules/trade-republic/trade-republic.registry.test.ts',
      'modules/trade-republic/trade-republic.docs.test.ts',
      // investments is a partial folder on purpose: feature 9 is schema plus
      // migration, with no HTTP surface (no routes/service/schema/types).
      // Precedent: modules/health/. The importer feature will add its service
      // here, so this list only grows: it checks that a file exists, never that
      // it is the only one.
      'modules/investments/investments.model.test.ts',
      // Feature 26: the layer stops being schema-only. Its service is the SINGLE
      // writer of InvestmentProduct and SavingsSnapshot (guardian below), and
      // its types are the contract between a product file and the database --
      // the twin of `lib/parsed-statement.ts` for statements.
      'modules/investments/investments.types.ts',
      'modules/investments/investments.service.ts',
      'modules/investments/investments.service.test.ts',
      // Feature 29: the end-to-end of the product files of MyInvestor entering
      // the database through the REAL registry of app.ts. It lives in the bank
      // module because it is that bank's entry, not a second importer.
      'modules/myinvestor/myinvestor.import.test.ts',
      // Feature 38: the money overview. One read-only endpoint that reuses the
      // balance of feature 31 and the totals of feature 36; it owns no sum.
      'modules/overview/overview.routes.ts',
      'modules/overview/overview.service.ts',
      'modules/overview/overview.schema.ts',
      'modules/overview/overview.types.ts',
      'modules/overview/overview.test.ts',
      // Feature 42: the total net worth of today. One read-only endpoint, same
      // shape as overview: it adds up what the other modules already compute.
      'modules/net-worth/net-worth.routes.ts',
      'modules/net-worth/net-worth.service.ts',
      'modules/net-worth/net-worth.schema.ts',
      'modules/net-worth/net-worth.types.ts',
      'modules/net-worth/net-worth.test.ts',
      // Feature 40: the transfer detection. The detection itself has no
      // endpoint -- the importer calls it after its file loop and its result
      // travels inside the import report. The routes/schema files are
      // of feature 44: the MANUAL writer of the link, which does have one.
      'modules/transfers/transfers.types.ts',
      'modules/transfers/transfers.service.ts',
      'modules/transfers/transfers.service.test.ts',
      'modules/transfers/transfers.schema.ts',
      'modules/transfers/transfers.routes.ts',
      'modules/transfers/transfers.routes.test.ts',
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
      'modules/overview/overview.routes.ts',
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

  it('keeps the ingestion module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/ingestion/ingestion.routes.ts',
      'modules/ingestion/ingestion.service.ts',
      'modules/ingestion/ingestion.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('has no src/modules/ingesta/ directory (renamed to English in feature 12)', () => {
    expect(existsSync(join(srcDir, 'modules/ingesta'))).toBe(false)
  })

  it('keeps the importer free of bank knowledge: the registry is injected (R14)', () => {
    // The bank names live in `app.ts`, the composition root, and reach the
    // importer as data. If this fails, a parser was imported inside the module.
    const bankModules = readdirSync(join(srcDir, 'modules'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) =>
        sourceFiles(join(srcDir, 'modules', name)).some((file) => file.endsWith('.parser.ts')),
      )

    expect(bankModules.length).toBeGreaterThan(0)
    for (const file of sourceFiles(join(srcDir, 'modules/import'))) {
      const source = readFileSync(file, 'utf8').toLowerCase()
      for (const bank of bankModules) {
        expect(source).not.toContain(bank)
      }
    }
  })

  it('keeps the importer off the filesystem', () => {
    // Feature 52: an import goes from the download to the parser to the database
    // in memory. If this fails, something of the importer (or of the detection
    // of pending files) reads or writes the disk of the machine again.
    const offenders = ['modules/import', 'modules/ingestion']
      .flatMap((dir) => sourceFiles(join(srcDir, dir)))
      .filter((file) => readFileSync(file, 'utf8').includes('node:fs'))
      .map((file) => relative(srcDir, file).replace(/\\/g, '/'))

    expect(offenders).toEqual([])
  })

  it('never creates an account from the importer: only the accounts service does (R19)', () => {
    for (const file of sourceFiles(join(srcDir, 'modules/import'))) {
      const source = readFileSync(file, 'utf8')

      expect(source).not.toContain('account.create')
      expect(source).not.toContain('accounts.create')
    }
  })

  it('keeps the bankinter parser module free of data access (no "prisma" reference)', () => {
    const files = ['modules/bankinter/bankinter.parser.ts', 'modules/bankinter/bankinter.types.ts']

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the myinvestor parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/myinvestor/myinvestor.deposit-maturity.ts',
      'modules/myinvestor/myinvestor.format.ts',
      'modules/myinvestor/myinvestor.statement.parser.ts',
      'modules/myinvestor/myinvestor.product.parser.ts',
      'modules/myinvestor/myinvestor.service.ts',
      'modules/myinvestor/myinvestor.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the n26 parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/n26/n26.csv.ts',
      'modules/n26/n26.format.ts',
      'modules/n26/n26.statement.parser.ts',
      'modules/n26/n26.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the openbank parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/openbank/openbank.html.ts',
      'modules/openbank/openbank.format.ts',
      'modules/openbank/openbank.statement.parser.ts',
      'modules/openbank/openbank.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the revolut parser module free of data access (no "prisma" reference)', () => {
    const files = [
      'modules/revolut/revolut.csv.ts',
      'modules/revolut/revolut.format.ts',
      'modules/revolut/revolut.statement.parser.ts',
      'modules/revolut/revolut.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('keeps the trade-republic parser module free of data access (no "prisma" reference)', () => {
    // This bank does not touch the database AT ALL (R5, decision of the human:
    // «no quiero que esto toque la base de datos»), same as the MyInvestor
    // product files. Nothing here is persisted, so nothing here names Prisma.
    const files = [
      'modules/trade-republic/trade-republic.product.parser.ts',
      'modules/trade-republic/trade-republic.service.ts',
      'modules/trade-republic/trade-republic.types.ts',
    ]

    for (const file of files) {
      expect(readFileSync(join(srcDir, file), 'utf8').toLowerCase()).not.toContain('prisma')
    }
  })

  it('writes the three investment tables only from modules/investments (features 26, 29)', () => {
    // ADR-026: the bank module reads the file, the investments service writes
    // it. If a second place ever upserts a product, the two upserts of a
    // product file stop being one transaction and the promise "a file that does
    // not add up leaves no trace" is no longer checkable in one place.
    //
    // `Valuation` joined the list in feature 29, when it stopped being a table
    // nobody wrote. It is matched through its client (`tx.` / `prisma.`) and not
    // by the bare word: `input.valuation.` is a legitimate field access in a
    // parser that has never seen a database.
    const writers = sourceFiles(srcDir)
      .filter((file) =>
        /\.(investmentProduct|savingsSnapshot)\.|(?:tx|prisma)\.valuation\./.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(srcDir, file).replace(/\\/g, '/'))
      .sort()

    expect(writers).toEqual(['modules/investments/investments.service.ts'])
  })

  it('keeps the investments service free of Drive and of bank knowledge (feature 26)', () => {
    const source = readFileSync(join(srcDir, 'modules/investments/investments.service.ts'), 'utf8')

    for (const forbidden of ['drive', 'Drive', 'JSON.parse', 'readFile']) {
      expect(source).not.toContain(forbidden)
    }
    for (const bank of [
      'bankinter',
      'myinvestor',
      'n26',
      'openbank',
      'revolut',
      'trade-republic',
    ]) {
      expect(source).not.toContain(bank)
    }
  })

  it('shares no parsing code between bank modules (one parser per bank)', () => {
    const bankModules = ['bankinter', 'myinvestor', 'n26', 'openbank', 'revolut', 'trade-republic']
    // What a bank module may import: vendor/node, its own files, the shared
    // error classes, `lib/` (the output contract) and the single sign helper of
    // `modules/movements/`, which is NOT a bank module.
    const allowedRelative = ['./', '../../errors/', '../../lib/', '../movements/']

    const forbiddenImports = bankModules
      .flatMap((bank) => sourceFiles(join(srcDir, 'modules', bank)))
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

    // And no other bank module reaches into one. `app.ts` is the composition
    // root and registers every module: it is the single expected importer.
    for (const bank of bankModules) {
      const outsideImporters = sourceFiles(srcDir)
        .filter(
          (file) => !relative(srcDir, file).replace(/\\/g, '/').startsWith(`modules/${bank}/`),
        )
        .filter((file) => readFileSync(file, 'utf8').includes(bank))
        .map((file) => relative(srcDir, file).replace(/\\/g, '/'))

      expect(outsideImporters).toEqual(['app.ts'])
    }
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

  it('wires the encoding-mismatch guard into ONE parser only (feature 22)', () => {
    // The guard is shared code in `lib/` because an encoding is not a format,
    // but it is OPT-IN: a parser calls it only if its bank emits a single-byte
    // encoding. This is what says the other three banks did not change
    // behaviour, instead of trusting the report that says so.
    const users = sourceFiles(srcDir)
      .filter((file) => readFileSync(file, 'utf8').includes('detectResaveAsUtf8'))
      .map((file) => relative(srcDir, file).replace(/\\/g, '/'))
      .sort()

    expect(users).toEqual(['lib/cp1252.ts', 'modules/openbank/openbank.statement.parser.ts'])
  })

  it('normalizes the bank name to the slug of its Drive folder and its module', () => {
    expect(normalizeBankName('MyInvestor')).toBe('myinvestor')
    expect(existsSync(join(srcDir, 'modules', normalizeBankName('MyInvestor')))).toBe(true)
    // The Drive folder of this one is written in capitals (`N26`): the module is
    // found through the normalized slug, never through the raw folder name.
    expect(normalizeBankName('N26')).toBe('n26')
    expect(existsSync(join(srcDir, 'modules', normalizeBankName('N26')))).toBe(true)
    expect(normalizeBankName('Openbank')).toBe('openbank')
    expect(existsSync(join(srcDir, 'modules', normalizeBankName('Openbank')))).toBe(true)
    expect(normalizeBankName('Revolut')).toBe('revolut')
    expect(existsSync(join(srcDir, 'modules', normalizeBankName('Revolut')))).toBe(true)
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
    // The rule is about MOVEMENT parsers, which are the ones that return the
    // shared contract of `lib/parsed-statement.ts`. A bank may have other
    // entries with no movements at all (feature 13: the investment product
    // files of myinvestor), and there is no sign to derive there.
    const parsers = sourceFiles(join(srcDir, 'modules'))
      .filter((file) => file.endsWith('.parser.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('lib/parsed-statement.js'))

    expect(parsers.length).toBeGreaterThan(0)
    for (const parser of parsers) {
      const source = readFileSync(parser, 'utf8')
      expect(source).toContain('deriveMovementTypeFromAmount')
      // No parser re-implements the sign rule (this is what used to say
      // `amount < 0 ? 'expense' : 'income'`).
      expect(source).not.toMatch(/amount\s*[<>]=?\s*0\s*\?/)
    }
  })

  it('mentions the var folder nowhere in the code', () => {
    // Feature 52: the project stopped using that folder of the human's disk.
    // What caused feature 33 was a default value pointing there; this keeps one
    // from coming back, in the code, the tests, the fixtures, the scripts and
    // the configuration of the suite.
    const repoRoot = join(srcDir, '..')
    const allowed: Record<string, string> = {
      'src/architecture.test.ts': 'this very test has to name what it looks for',
      'src/no-real-data.test.ts':
        'it checks that .gitignore ignores that folder and that nothing under it is versioned',
      'src/retired-routes.docs.test.ts':
        'it looks for the name of that folder in the documents, to check none describes it as something of today',
    }
    const everyFile = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = join(dir, entry.name)
        if (!entry.isDirectory()) return [fullPath]
        return entry.name === 'generated' ? [] : everyFile(fullPath)
      })
    const files = [
      ...everyFile(srcDir),
      ...everyFile(join(repoRoot, 'scripts')),
      ...readdirSync(join(repoRoot, 'prisma'))
        .filter((name) => name.endsWith('.ts'))
        .map((name) => join(repoRoot, 'prisma', name)),
      ...['vitest.config.ts', 'vitest.setup.ts', 'vitest.global-setup.ts', 'package.json'].map(
        (name) => join(repoRoot, name),
      ),
    ]
    const asPath = /(?<![\w/.-])var\//
    const asSegment = /['"]var['"]/

    const mentions = files.flatMap((file) => {
      const name = relative(repoRoot, file).replace(/\\/g, '/')
      if (name in allowed) return []
      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          asPath.test(line) || asSegment.test(line) ? [`${name}:${index + 1}`] : [],
        )
    })

    expect(files.length).toBeGreaterThan(100)
    expect(mentions).toEqual([])
  })

  it('has none of the files feature 52 removed', () => {
    const banks = ['bankinter', 'myinvestor', 'n26', 'openbank', 'revolut', 'trade-republic']
    const removed = [
      // The route of each bank, which read and wrote copies on disk.
      ...banks.flatMap((bank) => [
        `modules/${bank}/${bank}.routes.ts`,
        `modules/${bank}/${bank}.routes.test.ts`,
      ]),
      // The services that only walked those copies.
      ...['bankinter', 'n26', 'openbank', 'revolut'].flatMap((bank) => [
        `modules/${bank}/${bank}.service.ts`,
        `modules/${bank}/${bank}.service.test.ts`,
      ]),
      // POST /api/import/local.
      'modules/import/import.local.service.ts',
      'modules/import/import.local.service.test.ts',
      'modules/import/import.local.routes.test.ts',
      'modules/import/import.schema.ts',
      // The comparison of that folder before and after the suite (feature 33).
      'lib/test-var.ts',
      'lib/test-var.test.ts',
    ]

    expect(removed).toHaveLength(26)
    expect(removed.filter((file) => existsSync(join(srcDir, file)))).toEqual([])
  })
})

// The eight routes that only worked with the copies on disk are gone (feature
// 52, breaking change): they fall through to the central 404 handler.
describe('retired routes of feature 52 (R3)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 404 to the eight routes retired by feature 52', async () => {
    const retired = [
      '/api/parser/bankinter',
      '/api/parser/myinvestor',
      '/api/parser/n26',
      '/api/parser/openbank',
      '/api/parser/revolut',
      '/api/parser/trade-republic',
      '/api/import/local',
      '/api/ingestion/process',
    ]

    const wrong: string[] = []
    for (const url of retired) {
      const response = await app.inject({ method: 'POST', url })
      const body = response.json<{ statusCode?: number; code?: string }>()
      if (response.statusCode !== 404 || body.statusCode !== 404 || body.code !== 'NOT_FOUND') {
        wrong.push(`POST ${url} -> ${response.statusCode} ${body.code ?? ''}`)
      }
    }

    expect(retired).toHaveLength(8)
    expect(wrong).toEqual([])
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
