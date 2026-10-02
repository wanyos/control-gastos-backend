// CLI wrapper of `summarizeBankFile` (feature 52). Run with
//   pnpm run parse-file <banco> <ruta-del-archivo>
// to pass ONE file of the disk through the parser registered for that bank and
// see counts and shape: how many movements, which rows were not read, whether
// it carries IBAN and balance, first and last date. It prints no value of the
// file, so its output can be pasted into a report as it is.
//
// It stores nothing: it loads no `.env`, opens no database, builds no app and
// calls no Drive. It only READS the file it is given.
//
// Console is fine here: this is a command-line script, not the Fastify app
// (same conscious exception as `prisma/seed-categories.ts`).
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import { bankParsers, productParsers } from '../src/app.js'
import {
  exitCodeOf,
  formatBankFileSummary,
  summarizeBankFile,
} from '../src/modules/import/import.parse-file.js'

const usage = 'Uso: pnpm run parse-file <banco> <ruta-del-archivo>'

async function main(): Promise<number> {
  const [bank, filePath] = process.argv.slice(2)
  if (bank === undefined || filePath === undefined) {
    console.error(`Faltan argumentos.\n${usage}`)
    return 1
  }

  let content: Buffer
  try {
    content = await readFile(filePath)
  } catch (error) {
    // The path is not echoed: it is his, and this output ends up in reports.
    const code = (error as { code?: string }).code
    console.error(
      code === 'ENOENT'
        ? `La ruta del archivo no existe.\n${usage}`
        : `No se ha podido leer el archivo de esa ruta (${code ?? 'error desconocido'}).\n${usage}`,
    )
    return 1
  }

  const summary = await summarizeBankFile({
    bank,
    fileName: basename(filePath),
    content,
    parsers: bankParsers,
    productParsers,
  })
  const text = formatBankFileSummary(summary)
  if (exitCodeOf(summary) === 0) {
    console.log(text)
  } else {
    console.error(text)
  }
  return exitCodeOf(summary)
}

process.exitCode = await main()
