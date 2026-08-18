import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'

import { AppError } from '../../errors/app-error.js'
import { parseN26Statement } from './n26.statement.parser.js'
import type {
  FailedFile,
  IgnoredFile,
  N26ParseRunResult,
  ParsedStatementSummary,
} from './n26.types.js'

const bankName = 'n26'

/** The single entry of this bank: the statement of its current account. */
const statementExtension = '.csv'

/**
 * Parses every local N26 copy (the ones the drive-read feature dropped under
 * `<sourceBaseDir>/n26/<year>/`) and, for each statement, writes the structured
 * result to a JSON dump under `<dumpBaseDir>/n26/<year>/`.
 *
 * Read-only by design: it does NOT touch a database, does NOT talk to Drive and
 * does NOT move, delete or modify any source file. Which parser applies is
 * decided by the EXTENSION, and the bank comes from the FOLDER, never from the
 * contents.
 *
 * A per-file failure is isolated in `failed[]` and does not stop the rest; a
 * file this parser does not handle is not a failure and lands in `ignored[]`,
 * visible but out of the list of things to fix. Running it with no local copies
 * does nothing (the source dir may not even exist).
 *
 * Deterministic: years and files are walked in sorted order and the dump is
 * serialized the same way every run, so two consecutive runs over the same
 * input produce byte-identical dumps.
 */
export async function parseLocalN26Copies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<N26ParseRunResult> {
  const bankDir = join(sourceBaseDir, bankName)
  const statements: ParsedStatementSummary[] = []
  const failed: FailedFile[] = []
  const ignored: IgnoredFile[] = []

  for (const year of await listSubdirs(bankDir)) {
    const yearDir = join(bankDir, year)

    for (const file of await listFiles(yearDir)) {
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
  const result = parseN26Statement(content)
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
    // Logical relative path for the client: always '/', never the OS separator,
    // and never the absolute path of the machine.
    dumpPath: posix.join(bankName, year, `${file}.json`),
  }
}

/** Lists the immediate subdirectory names of `dir`, sorted; `[]` if it is absent. */
async function listSubdirs(dir: string): Promise<string[]> {
  const entries = await readDirSafe(dir)
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** Lists the file names directly under `dir`, sorted; `[]` if it is absent. */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readDirSafe(dir)
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

async function readDirSafe(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) {
      return []
    }
    throw error
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
  )
}

/**
 * Turns a caught error into a safe message. Parser failures are AppErrors with
 * a fixed message; filesystem errors are plain Errors whose message is a local
 * path, never a secret.
 */
function describeError(error: unknown): string {
  if (error instanceof AppError || error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
}
