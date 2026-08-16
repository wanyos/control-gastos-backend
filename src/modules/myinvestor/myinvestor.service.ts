import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'

import { AppError, ValidationError } from '../../errors/app-error.js'
import { parseMyinvestorProduct } from './myinvestor.product.parser.js'
import { parseMyinvestorStatement } from './myinvestor.statement.parser.js'
import type {
  FailedFile,
  IgnoredFile,
  MyinvestorParseRunResult,
  MyinvestorProductsResult,
  ParsedProduct,
  ParsedProductSummary,
  ParsedStatementSummary,
} from './myinvestor.types.js'

const bankName = 'myinvestor'

/** The two entries of this bank, told apart by the EXTENSION and nothing else. */
const statementExtension = '.csv'
const productExtension = '.json'

/** The single dump of every product of one year (R53). */
const productsDumpFile = 'products.json'

/**
 * Parses every local MyInvestor copy (the ones the drive-read feature dropped
 * under `<sourceBaseDir>/myinvestor/<year>/`) and, for each statement, writes
 * the structured result to a JSON dump under `<dumpBaseDir>/myinvestor/<year>/`.
 *
 * Read-only by design: it does NOT touch a database, does NOT talk to Drive and
 * does NOT move, delete or modify any source file. Which parser applies is
 * decided by the EXTENSION, and the bank comes from the FOLDER, never from the
 * contents.
 *
 * Two entries of the same bank: `.csv` is the current-account statement and
 * `.json` a hand-written investment product (feature 13). A per-file failure is
 * isolated in `failed[]` and does not stop the rest; a file this parser does not
 * handle is not a failure and lands in `ignored[]`, visible but out of the list
 * of things to fix. Running it with no local copies does nothing (the source dir
 * may not even exist).
 *
 * Deterministic: years and files are walked in sorted order and the dump is
 * serialized the same way every run, so two consecutive runs over the same
 * input produce byte-identical dumps.
 */
export async function parseLocalMyinvestorCopies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<MyinvestorParseRunResult> {
  const bankDir = join(sourceBaseDir, bankName)
  const years = await listSubdirs(bankDir)
  const statements: ParsedStatementSummary[] = []
  const products: ParsedProductSummary[] = []
  const failed: FailedFile[] = []
  const ignored: IgnoredFile[] = []

  for (const year of years) {
    const yearDir = join(bankDir, year)
    const yearProducts: ParsedProduct[] = []
    const yearFailed: FailedFile[] = []
    const yearIgnored: IgnoredFile[] = []
    let sawProductFile = false

    for (const file of await listFiles(yearDir)) {
      const extension = extname(file).toLowerCase()
      if (extension === statementExtension) {
        try {
          statements.push(await parseAndDump(yearDir, year, file, dumpBaseDir))
        } catch (error) {
          yearFailed.push({ bank: bankName, year, file, reason: describeError(error) })
        }
        continue
      }
      if (extension === productExtension) {
        sawProductFile = true
        try {
          // Files are walked in sorted order, so on a `(name, date)` clash the
          // first one alphabetically is already in `yearProducts` and wins (R46).
          const product = await parseProductFile(yearDir, file)
          const clash = findClash(yearProducts, product)
          if (clash) {
            yearFailed.push({
              bank: bankName,
              year,
              file,
              reason: `mismo producto y fecha que '${clash.file}' ('${product.name}', ${product.date}): se conserva el primero por orden alfabético`,
            })
          } else {
            yearProducts.push(product)
          }
        } catch (error) {
          yearFailed.push({ bank: bankName, year, file, reason: describeError(error) })
        }
        continue
      }
      yearIgnored.push({
        bank: bankName,
        year,
        file,
        reason: `extensión no soportada por este parser ('${extension || 'sin extensión'}')`,
      })
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
    parsedCount: statements.length,
    productCount: products.length,
    failedCount: failed.length,
    ignoredCount: ignored.length,
    statements,
    products,
    failed,
    ignored,
  }
}

/**
 * Parses one hand-written product file. The parser RETURNS the reason instead
 * of throwing, so a badly written file becomes an `AppError` here and lands in
 * `failed[]` through the same isolation the statements use.
 */
async function parseProductFile(yearDir: string, file: string): Promise<ParsedProduct> {
  const content = await readFile(join(yearDir, file), 'utf8')
  const result = parseMyinvestorProduct(file, content)
  if ('reason' in result) {
    throw new ValidationError(result.reason)
  }
  return result
}

/**
 * Two files describing the same product on the same date are the duplicated
 * copy Drive creates (`fondo.json` and `fondo (1).json`), not two photos: two
 * different dates are the normal case and never clash (R46).
 */
function findClash(products: ParsedProduct[], candidate: ParsedProduct): ParsedProduct | undefined {
  return products.find(
    (product) => product.name === candidate.name && product.date === candidate.date,
  )
}

/**
 * Writes the single `products.json` of the year and returns one summary per
 * product. One dump per YEAR, not per file: the clash of R46 is a fact of the
 * whole set, and `fondo.json.json` would be the very origin/dump confusion this
 * design avoids.
 */
async function dumpProducts(
  year: string,
  products: ParsedProduct[],
  failed: FailedFile[],
  ignored: IgnoredFile[],
  dumpBaseDir: string,
): Promise<ParsedProductSummary[]> {
  const result: MyinvestorProductsResult = { bank: bankName, year, products, failed, ignored }
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
    // Logical relative path for the client, as with the statements.
    dumpPath: posix.join(bankName, year, productsDumpFile),
  }))
}

/** Parses one statement copy and writes its JSON dump; returns its summary. */
async function parseAndDump(
  yearDir: string,
  year: string,
  file: string,
  dumpBaseDir: string,
): Promise<ParsedStatementSummary> {
  const content = await readFile(join(yearDir, file))
  const result = parseMyinvestorStatement(content)
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
