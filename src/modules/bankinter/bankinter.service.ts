import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'

import { AppError } from '../../errors/app-error.js'
import { parseBankinterXlsx } from './bankinter.parser.js'
import type { FailedParse, ParseRunResult, ParsedFileSummary } from './bankinter.types.js'

const bankName = 'bankinter'

/**
 * Parses every local Bankinter `.xlsx` copy (the ones the drive-read feature
 * dropped under `<sourceBaseDir>/bankinter/<year>/`) and, for each, writes the
 * structured result to a JSON dump under `<dumpBaseDir>/bankinter/<year>/`.
 *
 * Read-only by design: it does NOT touch a database, does NOT talk to Drive and
 * does NOT move any file. A per-file failure (unreadable file, unrecognized
 * statement) is isolated in `failed[]` and does not stop the rest. Running it
 * with no local copies does nothing (the source dir may not even exist).
 */
export async function parseLocalBankinterCopies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<ParseRunResult> {
  const bankDir = join(sourceBaseDir, bankName)
  const years = await listSubdirs(bankDir)
  const parsed: ParsedFileSummary[] = []
  const failed: FailedParse[] = []

  for (const year of years) {
    const yearDir = join(bankDir, year)
    const files = await listXlsxFiles(yearDir)
    for (const file of files) {
      try {
        const content = await readFile(join(yearDir, file))
        const result = await parseBankinterXlsx(content)
        const dumpPath = join(dumpBaseDir, bankName, year, `${file}.json`)
        await mkdir(dirname(dumpPath), { recursive: true })
        await writeFile(dumpPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
        parsed.push({
          bank: bankName,
          year,
          file,
          accountIban: result.accountIban,
          movements: result.movements.length,
          unparsedRows: result.unparsedRows.length,
          // Logical relative path for the client: always '/', never the OS separator.
          dumpPath: posix.join(bankName, year, `${file}.json`),
        })
      } catch (error) {
        failed.push({ bank: bankName, year, file, error: describeError(error) })
      }
    }
  }

  return { parsedCount: parsed.length, failedCount: failed.length, parsed, failed }
}

/** Lists the immediate subdirectory names of `dir`, sorted; `[]` if it is absent. */
async function listSubdirs(dir: string): Promise<string[]> {
  const entries = await readDirSafe(dir)
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** Lists the `.xlsx` file names directly under `dir`, sorted; `[]` if it is absent. */
async function listXlsxFiles(dir: string): Promise<string[]> {
  const entries = await readDirSafe(dir)
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
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
 * Turns a caught error into a safe message. Parser failures are AppErrors with a
 * fixed message; filesystem errors are plain Errors whose message is a local
 * path, never a secret.
 */
function describeError(error: unknown): string {
  if (error instanceof AppError || error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
}
