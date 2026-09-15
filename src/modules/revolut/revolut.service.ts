import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'

import { AppError } from '../../errors/app-error.js'
import { parseRevolutStatement } from './revolut.statement.parser.js'
import type {
  FailedFile,
  IgnoredFile,
  ParsedStatementSummary,
  RevolutParseRunResult,
} from './revolut.types.js'

const bankName = 'revolut'

/** The single entry of this bank: the statement of its account. */
const statementExtension = '.csv'

/**
 * Parses every local copy of this bank (the ones the drive-read feature dropped
 * under `<sourceBaseDir>/revolut/<year>/`) and, for each statement, writes the
 * structured result to a JSON dump under `<dumpBaseDir>/revolut/<year>/`.
 *
 * Read-only by design: it does NOT touch a database, does NOT talk to Drive and
 * does NOT move, delete or modify any source file. Which parser applies is
 * decided by the EXTENSION, and the bank comes from the FOLDER.
 *
 * A per-file failure is isolated in `failed[]` and does not stop the rest; a file
 * this parser does not handle lands in `ignored[]`. Running it with no local
 * copies does nothing (the source dir may not even exist).
 *
 * Deterministic: years and files are walked in sorted order and the dump is
 * serialized the same way every run.
 */
export async function parseLocalRevolutCopies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<RevolutParseRunResult> {
  const bankDir = join(sourceBaseDir, bankName)
  const statements: ParsedStatementSummary[] = []
  const failed: FailedFile[] = []
  const ignored: IgnoredFile[] = []

  for (const year of await listEntries(bankDir, 'directory')) {
    const yearDir = join(bankDir, year)

    for (const file of await listEntries(yearDir, 'file')) {
      const extension = extname(file).toLowerCase()
      if (extension !== statementExtension) {
        ignored.push({
          bank: bankName,
          year,
          file,
          reason: `extensión no soportada por este parser ('${extension || 'sin extensión'}')`,
        })
        continue
      }
      try {
        statements.push(await parseAndDump(yearDir, year, file, dumpBaseDir))
      } catch (error) {
        failed.push({ bank: bankName, year, file, reason: describeError(error) })
      }
    }
  }

  return {
    parsedCount: statements.length,
    failedCount: failed.length,
    ignoredCount: ignored.length,
    statements,
    failed,
    ignored,
  }
}

/** Parses one statement copy and writes its JSON dump; returns its summary. */
async function parseAndDump(
  yearDir: string,
  year: string,
  file: string,
  dumpBaseDir: string,
): Promise<ParsedStatementSummary> {
  const content = await readFile(join(yearDir, file))
  const result = parseRevolutStatement(content)
  const dumpPath = join(dumpBaseDir, bankName, year, `${file}.json`)
  await mkdir(dirname(dumpPath), { recursive: true })
  await writeFile(dumpPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

  return {
    bank: bankName,
    year,
    file,
    accountIban: result.accountIban,
    accountBalance: result.accountBalance,
    movements: result.movements.length,
    unparsedRows: result.unparsedRows.length,
    // Logical relative path for the client: always '/', never the absolute path.
    dumpPath: posix.join(bankName, year, `${file}.json`),
  }
}

/** Lists the names of the directories or files directly under `dir`, sorted; `[]` if absent. */
async function listEntries(dir: string, kind: 'directory' | 'file'): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) {
      return []
    }
    throw error
  }
  return entries
    .filter((entry) => (kind === 'directory' ? entry.isDirectory() : entry.isFile()))
    .map((entry) => entry.name)
    .sort()
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
  )
}

/** Turns a caught error into a safe message (parser AppErrors or filesystem Errors). */
function describeError(error: unknown): string {
  if (error instanceof AppError || error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
}
