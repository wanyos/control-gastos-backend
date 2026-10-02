// The command `pnpm run parse-file <banco> <ruta>` (feature 52): what it says
// about a file, and above all what it never says.
//
// 🔒 Nothing here is real (ADR-017): the bank is a made-up `zz-…` slug, the two
// parsers are declared in this file, the IBAN comes from `syntheticIban()` and
// every amount and description is invented.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { InvalidIbanError, ValidationError } from '../../errors/app-error.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { ProductParserAdapter } from '../investments/investments.types.js'
import { exitCodeOf, formatBankFileSummary, summarizeBankFile } from './import.parse-file.js'
import type { BankParserAdapter } from './import.types.js'

const bank = 'zz-parse-file'

interface InventedLine {
  date: string
  description: string
  amount: string
  balance: string
}

const inventedLines: InventedLine[] = [
  { date: '2026-03-04', description: 'PAGO INVENTADO PANADERIA', amount: '-37.42', balance: '' },
  {
    date: '2026-03-19',
    description: 'ABONO INVENTADO ALQUILER',
    amount: '412.76',
    balance: '918.63',
  },
  { date: '2026-03-11', description: 'RECIBO INVENTADO GIMNASIO', amount: 'treinta', balance: '' },
  {
    date: '2026-03-27',
    description: 'CUOTA INVENTADA SEGURO',
    amount: '-58.07',
    balance: '860.56',
  },
]

/** A statement file written the way a bank would: a labelled line and a table. */
function statementFile(iban: string, lines = inventedLines): Buffer {
  const rows = lines.map((line) =>
    [line.date, line.description, line.amount, line.balance].join(';'),
  )
  return Buffer.from([`iban;${iban}`, 'fecha;concepto;importe;saldo', ...rows].join('\n'), 'utf8')
}

/**
 * A statement parser declared HERE: the importer knows no bank and neither does
 * its suite. It reads the file above for real, so the summary is computed from
 * the values the test then looks for in the printed text.
 */
const statementAdapter: BankParserAdapter = {
  bank,
  extensions: ['.csv'],
  parse(content: Buffer): ParsedStatement {
    const [ibanLine, , ...rows] = content.toString('utf8').split('\n')
    const iban = (ibanLine ?? '').split(';')[1] ?? ''
    if (iban === 'not-an-iban') {
      throw new InvalidIbanError(`el iban '${iban}' de la línea 1 no es válido`)
    }
    const movements: ParsedMovement[] = []
    const unparsedRows: ParsedStatement['unparsedRows'] = []
    rows.forEach((row, index) => {
      const [date = '', description = '', amount = '', balance = ''] = row.split(';')
      if (Number.isNaN(Number(amount))) {
        // Quoted, as every real parser does: this is why a reason is never printed.
        unparsedRows.push({ row: index + 3, reason: `importe no interpretable ('${amount}')` })
        return
      }
      movements.push({
        bookingDate: date,
        valueDate: date,
        description,
        amount: Number(amount),
        balance: balance === '' ? null : Number(balance),
        currency: 'EUR',
        type: Number(amount) < 0 ? 'expense' : 'income',
        daySequence: 1,
      })
    })
    return {
      bank,
      accountIban: iban === '' ? null : iban,
      accountBalance: null,
      movements,
      unparsedRows,
    }
  },
}

const inventedProductName = 'Cuenta Inventada Remunerada'

/** A product parser declared HERE, reading a hand-written `.json`. */
const productAdapter: ProductParserAdapter = {
  bank,
  extensions: ['.json'],
  parse(_fileName: string, content: Buffer) {
    const raw = JSON.parse(content.toString('utf8')) as { name?: string; balance?: number }
    if (typeof raw.balance !== 'number') {
      throw new ValidationError(`el saldo de '${raw.name}' no es un número`)
    }
    return {
      bank,
      name: raw.name ?? '',
      type: 'savings_account',
      currency: 'EUR',
      openedAt: '2025-02-03',
      closedAt: null,
      date: '2026-03-31',
      openingBalance: raw.balance,
      moneyIn: 0,
      moneyOut: 0,
      interest: 0,
      balance: raw.balance,
    }
  },
}

function summarize(fileName: string, content: Buffer, bankTyped = bank) {
  return summarizeBankFile({
    bank: bankTyped,
    fileName,
    content,
    parsers: [statementAdapter],
    productParsers: [productAdapter],
  })
}

describe('the parse-file command (feature 52)', () => {
  it('summarizes a statement with counts and shape, and no value of the file', async () => {
    const iban = syntheticIban()

    const summary = await summarize('extracto-inventado.csv', statementFile(iban))

    expect(summary).toEqual({
      outcome: 'statement',
      movements: 3,
      unparsedRowNumbers: [5],
      hasIban: true,
      hasAccountBalance: false,
      linesWithBalance: 2,
      // First and last by DATE, not by position in the file.
      firstBookingDate: '2026-03-04',
      lastBookingDate: '2026-03-27',
    })
    expect(exitCodeOf(summary)).toBe(0)

    const printed = formatBankFileSummary(summary)
    expect(printed).toContain('Movimientos leídos: 3')
    expect(printed).toContain('Filas que no se han podido leer: 1 (filas 5)')
    expect(printed).toContain('Trae IBAN: sí')
    expect(printed).toContain('Trae saldo de la cuenta: no')
    expect(printed).toContain('Movimientos con saldo en su línea: 2 de 3')
    expect(printed).toContain('Primera fecha: 2026-03-04')
    expect(printed).toContain('Última fecha: 2026-03-27')
    // Not one value of the file: no IBAN, no amount, no balance, no description
    // -- and not the unreadable value either, which the parser's reason quotes.
    expect(printed).not.toContain(iban)
    for (const line of inventedLines) {
      expect(printed).not.toContain(line.description)
      expect(printed).not.toContain(line.amount)
      if (line.balance !== '') expect(printed).not.toContain(line.balance)
    }
    expect(printed).not.toContain('importe no interpretable')
  })

  it('summarizes a product file by its type', async () => {
    const content = Buffer.from(JSON.stringify({ name: inventedProductName, balance: 2714.39 }))

    // The bank is typed in capitals: it is normalized to the slug of its folder.
    const summary = await summarize('cuenta-inventada.json', content, bank.toUpperCase())

    expect(summary).toEqual({ outcome: 'product', type: 'savings_account' })
    expect(exitCodeOf(summary)).toBe(0)
    const printed = formatBankFileSummary(summary)
    expect(printed).toContain('Tipo de producto: savings_account')
    expect(printed).not.toContain(inventedProductName)
    expect(printed).not.toContain('2714.39')
  })

  it('says there is no parser for the bank', async () => {
    const summary = await summarize('extracto.csv', statementFile(syntheticIban()), 'zz-otro-banco')

    expect(summary).toEqual({
      outcome: 'no-parser',
      reason: 'no hay parser para el banco zz-otro-banco',
    })
    expect(exitCodeOf(summary)).toBe(1)
    expect(formatBankFileSummary(summary)).toContain('no hay parser para el banco zz-otro-banco')
  })

  it('says the extension is not read by that bank', async () => {
    const summary = await summarize('extracto.pdf', Buffer.from('no se abre'))

    expect(summary).toEqual({
      outcome: 'no-parser',
      reason: `extensión no soportada por el parser de ${bank}`,
    })
    expect(exitCodeOf(summary)).toBe(1)

    // A bank that only has product files is NOT a bank without parser: the case
    // reported is still the extension.
    const productOnly = await summarizeBankFile({
      bank,
      fileName: 'extracto.pdf',
      content: Buffer.from('no se abre'),
      parsers: [],
      productParsers: [productAdapter],
    })
    expect(productOnly).toEqual({
      outcome: 'no-parser',
      reason: `extensión no soportada por el parser de productos de ${bank}`,
    })
  })

  it('reports a rejected file by its code only, never its message', async () => {
    const statement = await summarize('extracto.csv', statementFile('not-an-iban'))
    const product = await summarize(
      'cuenta.json',
      Buffer.from(JSON.stringify({ name: inventedProductName, balance: 'dos mil' })),
    )

    expect(statement).toEqual({ outcome: 'rejected', code: 'INVALID_IBAN' })
    expect(product).toEqual({ outcome: 'rejected', code: 'VALIDATION_ERROR' })
    expect(exitCodeOf(statement)).toBe(1)
    expect(exitCodeOf(product)).toBe(1)
    // The messages of both errors quote a value of the file; the text does not.
    const printed = `${formatBankFileSummary(statement)}\n${formatBankFileSummary(product)}`
    expect(printed).toContain('INVALID_IBAN')
    expect(printed).toContain('VALIDATION_ERROR')
    expect(printed).not.toContain('not-an-iban')
    expect(printed).not.toContain(inventedProductName)
  })

  it('takes no database nor Drive client, and imports nothing from node:fs', () => {
    const source = readFileSync(new URL('./import.parse-file.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('node:fs')
    expect(source.toLowerCase()).not.toContain('prisma')
    expect(source).not.toContain('AppDriveClient')
    // The one thing it takes from the Drive helpers is the name normalizer,
    // which calls nothing.
    const fromDriveStructure = [
      ...source.matchAll(/import\s+\{([^}]*)\}\s+from\s+'[^']*drive-structure\.js'/g),
    ].flatMap((match) => (match[1] ?? '').split(',').map((name) => name.trim()))
    expect(fromDriveStructure.filter((name) => name.length > 0)).toEqual(['normalizeBankName'])
    // And what it is handed is bytes and the two registries, nothing else.
    const inputFields =
      /export interface SummarizeBankFileInput \{([^}]*)\}/.exec(source)?.[1] ?? ''
    const fieldNames = [...inputFields.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1])
    expect(fieldNames).toEqual(['bank', 'fileName', 'content', 'parsers', 'productParsers'])
  })
})
