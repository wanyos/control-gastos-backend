import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'

import { AppError, ValidationError } from '../../errors/app-error.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { parseTradeRepublicProduct } from './trade-republic.product.parser.js'
import type {
  FailedFile,
  IgnoredFile,
  ParsedSavingsAccount,
  ParsedSavingsAccountSummary,
  TradeRepublicParseRunResult,
  TradeRepublicProductsResult,
} from './trade-republic.types.js'

const bankName = 'trade-republic'

/**
 * The ONLY entry of this bank: the hand-written account file. Its `.pdf`
 * statement keeps landing in the same folder every month and is NOT a failure —
 * it is deliberately ignored (R14), because this bank enters the system without
 * a parser of what the bank emits (ADR-024).
 */
const productExtension = '.json'

/** The single dump of every account file of one year. */
const productsDumpFile = 'products.json'

/**
 * Parses every local Trade Republic copy (the ones the drive-read feature dropped
 * under `<sourceBaseDir>/trade-republic/<year>/`) and writes ONE `products.json`
 * per year under `<dumpBaseDir>/trade-republic/<year>/`.
 *
 * Read-only by design: it does NOT touch a database, does NOT talk to Drive and
 * does NOT move, delete or modify any source file. Which parser applies is
 * decided by the EXTENSION, and the bank comes from the FOLDER, never from the
 * contents.
 *
 * A per-file failure is isolated in `failed[]` and does not stop the rest; a file
 * this parser does not handle is not a failure and lands in `ignored[]`, visible
 * but out of the list of things to fix. Running it with no local copies does
 * nothing (the source dir may not even exist).
 *
 * Deterministic: years and files are walked in sorted order and the dump is
 * serialized the same way every run, so two consecutive runs over the same input
 * produce byte-identical dumps.
 */
export async function parseLocalTradeRepublicCopies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<TradeRepublicParseRunResult> {
  const bankDir = join(sourceBaseDir, bankName)
  const products: ParsedSavingsAccountSummary[] = []
  const failed: FailedFile[] = []
  const ignored: IgnoredFile[] = []

  for (const year of await listSubdirs(bankDir)) {
    const yearDir = join(bankDir, year)
    const yearProducts: ParsedSavingsAccount[] = []
    const yearFailed: FailedFile[] = []
    const yearIgnored: IgnoredFile[] = []
    let sawProductFile = false

    for (const file of await listFiles(yearDir)) {
      const extension = extname(file).toLowerCase()
      if (extension !== productExtension) {
        yearIgnored.push({
          bank: bankName,
          year,
          file,
          reason: `extensión no soportada por este parser ('${extension || 'sin extensión'}')`,
        })
        continue
      }

      sawProductFile = true
      try {
        // Files are walked in sorted order, so on a `(name, date)` clash the
        // first one alphabetically is already in `yearProducts` and wins.
        const product = await parseAccountFile(yearDir, file)
        const clash = findClash(yearProducts, product)
        if (clash) {
          yearFailed.push({
            bank: bankName,
            year,
            file,
            reason: `misma cuenta y fecha que '${clash.file}' ('${product.name}', ${product.date}): se conserva el primero por orden alfabético`,
          })
        } else {
          yearProducts.push(product)
        }
      } catch (error) {
        yearFailed.push({ bank: bankName, year, file, reason: describeError(error) })
      }
    }

    if (sawProductFile) {
      products.push(
        ...(await dumpProducts(year, yearProducts, yearFailed, yearIgnored, dumpBaseDir)),
      )
    }
    failed.push(...yearFailed)
    ignored.push(...yearIgnored)
  }

  return {
    productCount: products.length,
    failedCount: failed.length,
    ignoredCount: ignored.length,
    products,
    failed,
    ignored,
  }
}

/**
 * Parses one hand-written account file.
 *
 * The bytes are decoded with `decodeUtf8Strict` and NEVER with
 * `readFile(…, 'utf8')` (ADR-018): this file is written by the human, so it is
 * expected in UTF-8, and a file his editor saved as cp1252 would otherwise lose
 * every accent in silence while the parse looked perfect.
 *
 * The parser RETURNS the reason instead of throwing, so a badly written file
 * becomes an `AppError` here and lands in `failed[]` through the same isolation
 * a filesystem error uses.
 */
async function parseAccountFile(yearDir: string, file: string): Promise<ParsedSavingsAccount> {
  const content = decodeUtf8Strict(await readFile(join(yearDir, file)))
  const result = parseTradeRepublicProduct(file, content)
  if ('reason' in result) {
    throw new ValidationError(result.reason)
  }
  return result
}

/**
 * Two files describing the same account on the same date are the duplicated copy
 * Drive creates when the same file is uploaded twice, not two photos: the same
 * account with ANOTHER date is the normal monthly case and never clashes.
 */
function findClash(
  products: ParsedSavingsAccount[],
  candidate: ParsedSavingsAccount,
): ParsedSavingsAccount | undefined {
  return products.find(
    (product) => product.name === candidate.name && product.date === candidate.date,
  )
}

/**
 * Writes the single `products.json` of the year and returns one summary per
 * account. One dump per YEAR, not per file: the clash above is a fact of the
 * whole set, and `cuenta.json.json` would be the very origin/dump confusion this
 * design avoids.
 */
async function dumpProducts(
  year: string,
  products: ParsedSavingsAccount[],
  failed: FailedFile[],
  ignored: IgnoredFile[],
  dumpBaseDir: string,
): Promise<ParsedSavingsAccountSummary[]> {
  const result: TradeRepublicProductsResult = { bank: bankName, year, products, failed, ignored }
  const dumpPath = join(dumpBaseDir, bankName, year, productsDumpFile)
  await mkdir(dirname(dumpPath), { recursive: true })
  await writeFile(dumpPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

  return products.map((product) => ({
    bank: bankName,
    year,
    file: product.file,
    type: product.type,
    name: product.name,
    date: product.date,
    // Logical relative path for the client: always '/', never the OS separator,
    // and never the absolute path of the machine.
    dumpPath: posix.join(bankName, year, productsDumpFile),
  }))
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
