import { describe, expect, it } from 'vitest'

import {
  InvalidIbanError,
  UnexpectedEncodingError,
  ValidationError,
} from '../../errors/app-error.js'
import {
  buildOpenbankStatement,
  buildOpenbankStatementText,
  documentationIban,
  openbankHeaders,
  openbankManyRows,
  resaveInUtf8AsAnEditorWould,
  syntheticPreamble,
  toCp1252,
} from './openbank.fixture.js'
import { parseOpenbankStatement } from './openbank.statement.parser.js'

/** The OTHER synthetic IBAN of this repo, used only to prove the first one wins. */
const otherDocumentationIban = 'ES9820385778983000760236'

/**
 * Every document here is synthetic and built in memory (`openbank.fixture.ts`):
 * the real export of this bank carries the name of its holder and the names of
 * third parties inside the concepts, and not one of them is in this repository
 * (feature 14). No test touches the network or the database.
 */
describe('parseOpenbankStatement — the shared contract (R1)', () => {
  it('returns the common shape, with this bank named in it', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.bank).toBe('openbank')
    expect(Object.keys(result).sort()).toEqual([
      'accountBalance',
      'accountIban',
      'bank',
      'movements',
      'unparsedRows',
    ])
    expect(Object.keys(result.movements[0]).sort()).toEqual([
      'amount',
      'balance',
      'bookingDate',
      'currency',
      'daySequence',
      'description',
      'type',
      'valueDate',
    ])
  })
})

describe('parseOpenbankStatement — the encoding the bank emits (R2)', () => {
  it('decodes the cp1252 bytes of the bank, accents included', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.movements[1].description).toBe('RECIBO SUSCRIPCIÓN INVENTADA')
    expect(JSON.stringify(result)).not.toContain('�')
  })

  it('reads a concept with every accented character a Spanish statement can carry', () => {
    const rows = [['17/08/2026', '17/08/2026', 'GESTIÓN AÑO ÚNICO ÁEÍÓÚ Ñ', '-1,00', '13,41']]

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements[0].description).toBe('GESTIÓN AÑO ÚNICO ÁEÍÓÚ Ñ')
  })
})

describe('parseOpenbankStatement — the file has to declare its encoding (R3)', () => {
  it('rejects the whole file when it declares nothing, emitting no movement', () => {
    const content = buildOpenbankStatement({ charset: null })

    expect(() => parseOpenbankStatement(content)).toThrow(UnexpectedEncodingError)

    const error = catchAppError(() => parseOpenbankStatement(content))
    expect(error.code).toBe('UNEXPECTED_ENCODING')
    expect(error.statusCode).toBe(422)
    expect(error.message).toContain('no declara su codificación')
  })

  it('rejects the whole file when it declares another encoding, saying which one', () => {
    // The day Openbank switches to UTF-8: without this the 200 concepts would
    // enter mangled and NOTHING would fail (cp1252 maps every byte).
    const content = buildOpenbankStatement({ charset: 'utf-8', encoding: 'utf8' })

    const error = catchAppError(() => parseOpenbankStatement(content))
    expect(error.code).toBe('UNEXPECTED_ENCODING')
    expect(error.message).toContain("'utf-8'")
    expect(error.message).toContain('acentos')
  })

  it('accepts the two spellings of the same encoding', () => {
    for (const charset of ['iso-8859-1', 'ISO-8859-1', 'windows-1252']) {
      expect(
        parseOpenbankStatement(buildOpenbankStatement({ charset })).movements,
      ).not.toHaveLength(0)
    }
  })
})

/**
 * Feature 22, and this is the incident it comes from, reproduced: on 2026-08-19
 * the statement arrived from the bank in cp1252 declaring `iso-8859-1`, the
 * human opened it in Visual Studio Code to add the IBAN comment and hit save.
 * The editor read it as UTF-8, replaced its 8 accented bytes with `U+FFFD` and
 * saved it back as UTF-8 with the `<meta>` untouched. The parser did the right
 * thing — read it as cp1252, which is what the file still claimed — the header
 * came out as mojibake and the file was rejected with «this is not a statement
 * of this bank». Loud, and false.
 */
describe('parseOpenbankStatement — the file was re-saved in another encoding (C1, C2, C3)', () => {
  /** The file exactly as the editor left it that day. */
  const resaved = resaveInUtf8AsAnEditorWould(buildOpenbankStatement())

  it('has the three properties measured on the real file that day', () => {
    // The fixture is only worth something if it is the same SHAPE of damage:
    // clean UTF-8, scars inside, and a declaration that still says cp1252.
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(resaved)).not.toThrow()
    expect(resaved.toString('utf8')).toContain('�')
    expect(resaved.toString('utf8')).toContain('charset=iso-8859-1')
  })

  it('rejects it saying it was re-saved, NEVER that the header is missing (C1)', () => {
    const error = catchAppError(() => parseOpenbankStatement(resaved))

    expect(error).toBeInstanceOf(UnexpectedEncodingError)
    expect(error.code).toBe('UNEXPECTED_ENCODING')
    expect(error.statusCode).toBe(422)
    expect(error.message).toContain('vuelto a guardar')
    expect(error.message).toContain("'iso-8859-1'")
    // The lie of 2026-08-19, which is the whole point of this feature.
    expect(error.message).not.toContain('no se encuentra la cabecera')
    expect(() => parseOpenbankStatement(resaved)).not.toThrow(ValidationError)
  })

  it('says the accents are already lost and sends him to download it again (C2)', () => {
    const error = catchAppError(() => parseOpenbankStatement(resaved))

    expect(error.message).toContain('carácter de sustitución')
    expect(error.message).toContain('PERDIDO')
    expect(error.message).toContain('vuelve a descargarlo del banco')
    // Nothing is repaired and nothing is guessed: no movement comes out of a
    // file like this, not even the rows that were pure ASCII.
    expect(() => parseOpenbankStatement(resaved)).toThrow(UnexpectedEncodingError)
  })

  it('rejects a re-save whose accents survived, and names the encoding to save with (C1, C3)', () => {
    // The same mismatch WITHOUT scars: an editor that converted the text
    // correctly but left the old declaration behind. The characters are all
    // there, so the remedy is different — save it again as the bank writes it.
    const converted = buildOpenbankStatement({ encoding: 'utf8' })

    const error = catchAppError(() => parseOpenbankStatement(converted))

    expect(error.code).toBe('UNEXPECTED_ENCODING')
    expect(error.message).toContain('vuelto a guardar')
    expect(error.message).toContain('Western (Windows-1252)')
    expect(error.message).not.toContain('no se encuentra la cabecera')
  })

  it('tells him WHAT TO DO in both reasons, not only what happened (C3)', () => {
    const reasons = [
      catchAppError(() => parseOpenbankStatement(resaved)).message,
      catchAppError(() => parseOpenbankStatement(buildOpenbankStatement({ encoding: 'utf8' })))
        .message,
    ]

    for (const reason of reasons) {
      expect(reason).toContain('Windows-1252')
      expect(reason).toMatch(/vuelve a (abrirlo|descargarlo)/)
    }
  })

  it('does not fire on the file the bank actually sends, accents and all (C4)', () => {
    // The other half of the criterion: the signal has to be silent on a
    // legitimate export. Its accents are single cp1252 bytes, which is not
    // valid UTF-8, and that is what makes the check a fact and not a guess.
    expect(parseOpenbankStatement(buildOpenbankStatement()).movements).toHaveLength(8)
  })

  it('does not fire on a statement that happens to have no accent at all (C4)', () => {
    // Pure ASCII: cp1252 and UTF-8 are the same bytes, so no reading can differ
    // and there is nothing to protect against. It must enter, not be rejected.
    const rows = [['17/08/2026', '17/08/2026', 'PAGO SIN TILDES', '-12,34', '99,00']]
    const ascii = buildOpenbankStatement({
      rows,
      headers: ['Fecha Operacion', 'Fecha Valor', 'Concepto', 'Importe', 'Saldo'],
      preamble: [{ label: 'Titular:', value: 'PERSONA INVENTADA' }],
    })

    expect(ascii.some((byte) => byte >= 0x80)).toBe(false)
    expect(parseOpenbankStatement(ascii).movements).toHaveLength(1)
  })

  it('does not weaken the guard of feature 19 (C7)', () => {
    // A re-saved file that ALSO stopped declaring anything is still rejected,
    // and by the older guard: the declaration is checked first because without
    // it there is no encoding to contradict.
    const noDeclaration = resaveInUtf8AsAnEditorWould(buildOpenbankStatement({ charset: null }))

    const error = catchAppError(() => parseOpenbankStatement(noDeclaration))
    expect(error.code).toBe('UNEXPECTED_ENCODING')
    expect(error.message).toContain('no declara su codificación')
  })
})

describe('parseOpenbankStatement — a legitimate export still enters whole (C8)', () => {
  it('parses a month-sized statement with 200 movements and 0 unparsed rows', () => {
    const rows = openbankManyRows(200)

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements).toHaveLength(200)
    expect(result.unparsedRows).toEqual([])
    expect(result.accountIban).toBe(documentationIban)
    expect(result.accountBalance).toBe(1234.56)
    // The accents of all 200 concepts survived, which is the reason the file is
    // read as cp1252 in the first place.
    expect(result.movements[0].description).toBe('GESTIÓN SINTÉTICA NÚMERO 0')
    expect(JSON.stringify(result)).not.toContain('�')
  })
})

describe('parseOpenbankStatement — a file that is not a statement (R4)', () => {
  it('throws ValidationError when there is no recognizable header row', () => {
    const content = buildOpenbankStatement({ headers: ['A', 'B', 'C', 'D', 'E'] })

    expect(() => parseOpenbankStatement(content)).toThrow(ValidationError)
    expect(catchAppError(() => parseOpenbankStatement(content)).message).toContain('cabecera')
  })

  it('throws ValidationError for an HTML page with no table at all', () => {
    const html = '<html><head><meta charset="iso-8859-1"></head><body>hola</body></html>'

    expect(() => parseOpenbankStatement(Buffer.from(html, 'latin1'))).toThrow(ValidationError)
  })

  it('finds the header however the bank cases or accents its own names', () => {
    const headers = openbankHeaders.map((name) => name.toUpperCase())

    expect(parseOpenbankStatement(buildOpenbankStatement({ headers })).movements).toHaveLength(8)
  })
})

describe('parseOpenbankStatement — the whole history enters (R5)', () => {
  it('emits one movement per readable row of the table, in file order', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.movements).toHaveLength(8)
    expect(result.movements.map((movement) => movement.description)).toEqual([
      'COMPRA TARJETA TIENDA INVENTADA',
      'RECIBO SUSCRIPCIÓN INVENTADA',
      'TRANSFERENCIA A ES0012345678901234567890',
      'NOMINA INVENTADA DE JULIO',
      'AJUSTE A CERO',
      'PAGO REPETIDO INVENTADO',
      'PAGO REPETIDO INVENTADO',
      'INGRESO INICIAL INVENTADO',
    ])
  })

  it('keeps the movements of two years back: nothing is cut off by date', () => {
    const years = new Set(
      parseOpenbankStatement(buildOpenbankStatement()).movements.map((movement) =>
        movement.bookingDate.slice(0, 4),
      ),
    )

    expect([...years].sort()).toEqual(['2024', '2026'])
  })

  it('enters a file of two hundred movements whole, without deduplicating', () => {
    // The volume of the real export, built here: 200 rows spread over three
    // years, the last hundred of them identical to each other.
    const rows = Array.from({ length: 200 }, (_, index) => {
      const year = 2024 + Math.floor(index / 100)
      return index < 100
        ? [
            `0${(index % 28) + 1}`.slice(-2) + `/0${(index % 9) + 1}`.slice(-3) + `/${year}`,
            `0${(index % 28) + 1}`.slice(-2) + `/0${(index % 9) + 1}`.slice(-3) + `/${year}`,
            `MOVIMIENTO INVENTADO ${index}`,
            '-1,00',
            '63,92',
          ]
        : ['15/06/2026', '15/06/2026', 'FILA REPETIDA INVENTADA', '-2,50', '63,92']
    })

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements).toHaveLength(200)
    expect(result.unparsedRows).toEqual([])
    expect(
      result.movements.filter((movement) => movement.description === 'FILA REPETIDA INVENTADA'),
    ).toHaveLength(100)
  })
})

describe('parseOpenbankStatement — dates and amounts (R6, R7)', () => {
  it('turns DD/MM/AAAA into ISO, keeping the value date as its own datum', () => {
    const [first] = parseOpenbankStatement(buildOpenbankStatement()).movements

    expect(first.bookingDate).toBe('2026-08-17')
    expect(first.valueDate).toBe('2026-08-16')
  })

  it('keeps the sign and the cents of the amount, with no rounding', () => {
    const amounts = parseOpenbankStatement(buildOpenbankStatement()).movements.map(
      (movement) => movement.amount,
    )

    expect(amounts).toEqual([-37.49, -482.13, -2615.08, 947.62, 0, -88.77, -88.77, 8253.47])
  })
})

describe('parseOpenbankStatement — what is read and not kept (R8)', () => {
  it('leaves the per-movement balance null although the file does report it', () => {
    // This is the only file of the project carrying a running balance. The
    // human decided it is not stored: ADR-013 is not touched here.
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.movements.every((movement) => movement.balance === null)).toBe(true)
  })

  it('leaves the currency empty instead of inventing an EUR for every row', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.movements.every((movement) => movement.currency === '')).toBe(true)
    // …not even when the balance of the preamble does carry one.
    expect(result.accountBalance).toBe(1234.56)
  })

  it('reports the row when its fifth cell is not a balance, instead of dropping it', () => {
    const rows = [['17/08/2026', '17/08/2026', 'SALDO ILEGIBLE', '-1,00', 'no es un saldo']]

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements).toEqual([])
    expect(result.unparsedRows[0].reason).toContain('saldo del movimiento no interpretable')
  })
})

describe('parseOpenbankStatement — the balance of the account (R9, R10)', () => {
  it('reads it from the Saldo row of the file, dropping the currency glued to it', () => {
    expect(parseOpenbankStatement(buildOpenbankStatement()).accountBalance).toBe(1234.56)
  })

  it('is null when the file prints no such row, and that is not a failure', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement({ balance: null }))

    expect(result.accountBalance).toBeNull()
    // Nothing is reported about it: an absent row is simply not written.
    expect(result.unparsedRows.map((row) => row.reason).join(' ')).not.toContain(
      'saldo de la cuenta',
    )
    expect(result.movements).toHaveLength(8)
  })

  it('reports the row with its number when the value is unreadable, and parses the rest', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement({ balance: 'no disponible' }))

    expect(result.accountBalance).toBeNull()
    expect(result.unparsedRows[0]).toEqual({
      row: 6,
      reason: "saldo de la cuenta no interpretable ('no disponible')",
    })
    expect(result.movements).toHaveLength(8)
  })

  it('never confuses it with the balance of a line: they are two different data', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.accountBalance).toBe(1234.56)
    expect(result.movements[0].balance).toBeNull()
  })
})

describe('parseOpenbankStatement — the IBAN the human writes once (R11)', () => {
  it('reads it from the HTML comment of the first line', () => {
    expect(parseOpenbankStatement(buildOpenbankStatement()).accountIban).toBe(documentationIban)
  })

  it('normalizes it, however he groups or cases it', () => {
    const written = 'es91 2100 0418 4502 0005 1332'

    expect(parseOpenbankStatement(buildOpenbankStatement({ iban: written })).accountIban).toBe(
      documentationIban,
    )
  })

  it('is null when the file comes untouched from the bank', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement({ iban: null }))

    expect(result.accountIban).toBeNull()
    expect(result.movements).toHaveLength(8)
  })

  it('never derives it from the CCC of the preamble nor from a concept that looks like one', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement({ iban: null }))
    const ccc = syntheticPreamble()[1].value

    expect(result.accountIban).toBeNull()
    // The concept of the third row IS an IBAN-shaped string and stays inside it.
    expect(result.movements[2].description).toContain('ES00')
    expect(JSON.stringify(result)).not.toContain(ccc.replace(/\s/g, ''))
  })

  it('rejects the whole file when the hand-written IBAN does not check out (feature 21)', () => {
    // One digit changed: the shape is right and the mod-97 is not.
    const mistyped = 'ES9121000418450200051333'
    const content = buildOpenbankStatement({ iban: mistyped })

    expect(() => parseOpenbankStatement(content)).toThrow(InvalidIbanError)
    expect(catchAppError(() => parseOpenbankStatement(content)).message).toContain(
      'dígito de control',
    )
  })

  it('does not read it from a comment written with `:` (one documented form only)', () => {
    // Ratified in feature 21: `:` is not tolerated anywhere. The file ends in
    // the loud MISSING_ACCOUNT_DATA of the importer instead of two ways of
    // writing the same datum.
    const withColon = buildOpenbankStatementText({ iban: null }).replace(
      '<!DOCTYPE',
      `<!-- iban:${documentationIban} -->\n<!DOCTYPE`,
    )

    const result = parseOpenbankStatement(toCp1252(withColon))

    expect(result.accountIban).toBeNull()
    expect(result.movements).toHaveLength(8)
  })

  it('takes the FIRST labelled comment when there is more than one', () => {
    const twice = buildOpenbankStatementText().replace(
      '<!DOCTYPE',
      `<!-- iban;${otherDocumentationIban} -->\n<!DOCTYPE`,
    )

    expect(parseOpenbankStatement(toCp1252(twice)).accountIban).toBe(documentationIban)
  })
})

describe('parseOpenbankStatement — what never reaches unparsedRows (R12)', () => {
  it('ignores the whole preamble and the decorative rows in silence', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())
    const reasons = result.unparsedRows.map((row) => row.reason).join(' ')

    expect(result.unparsedRows).toHaveLength(2)
    for (const label of syntheticPreamble().map((entry) => entry.label)) {
      expect(reasons).not.toContain(label)
    }
    expect(reasons).not.toContain('celdas inesperado')
  })

  it('reports nothing at all for a clean file, preamble and spacers included', () => {
    const rows = [['17/08/2026', '17/08/2026', 'UNICO MOVIMIENTO INVENTADO', '-1,00', '13,41']]

    expect(parseOpenbankStatement(buildOpenbankStatement({ rows })).unparsedRows).toEqual([])
  })

  it('keeps no name of the preamble anywhere in the result', () => {
    const result = JSON.stringify(parseOpenbankStatement(buildOpenbankStatement()))

    expect(result).not.toContain('PERSONA INVENTADA DE PRUEBA')
    expect(result).not.toContain('CUENTA SINTETICA DE PRUEBA')
  })
})

describe('parseOpenbankStatement — a row that looks like a movement is never dropped (R13)', () => {
  it('reports the unreadable amount and the impossible date, with their row numbers', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())

    expect(result.unparsedRows).toEqual([
      { row: 16, reason: "importe no interpretable ('mil trescientos')" },
      {
        row: 17,
        reason:
          "fecha de operación inválida ('31/02/2026'); fecha de valor inválida ('31/02/2026')",
      },
    ])
  })

  it('reports a row with the wrong number of cells instead of guessing its columns', () => {
    const rows = [['17/08/2026', '17/08/2026', 'FALTA UNA CELDA', '-1,00']]

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements).toEqual([])
    expect(result.unparsedRows[0].reason).toBe('número de celdas inesperado (4, se esperaban 5)')
  })

  it('says everything wrong with a row at once, not just the first problem', () => {
    const rows = [['ayer', '17/13/2026', 'TODO MAL', 'mucho', 'poco']]

    const reason = parseOpenbankStatement(buildOpenbankStatement({ rows })).unparsedRows[0].reason

    expect(reason).toContain('fecha de operación inválida')
    expect(reason).toContain('fecha de valor inválida')
    expect(reason).toContain('importe no interpretable')
    expect(reason).toContain('saldo del movimiento no interpretable')
  })
})

describe('parseOpenbankStatement — the two shared rules (R14)', () => {
  it('numbers the position inside the day with 1 as the OLDEST, though the file is newest-first', () => {
    const sameDay = parseOpenbankStatement(buildOpenbankStatement()).movements.filter(
      (movement) => movement.bookingDate === '2026-08-17',
    )

    // The file lists them most recent first, so the LAST of the three is the
    // oldest of the day and the one that must be numbered 1.
    expect(sameDay.map((movement) => movement.daySequence)).toEqual([3, 2, 1])
  })

  it('gives a day with a single movement the number 1', () => {
    const result = parseOpenbankStatement(buildOpenbankStatement())
    const alone = result.movements.filter((movement) => movement.bookingDate === '2026-07-27')

    expect(alone.map((movement) => movement.daySequence)).toEqual([1])
  })

  it('never lets an unparsed row consume a number of its day (ADR-013)', () => {
    const rows = [
      ['24/07/2026', '24/07/2026', 'BUENO INVENTADO', '-1,00', '13,41'],
      ['24/07/2026', '24/07/2026', 'ROTO INVENTADO', 'no es un importe', '13,41'],
      ['24/07/2026', '24/07/2026', 'OTRO BUENO INVENTADO', '-2,00', '11,29'],
    ]

    const result = parseOpenbankStatement(buildOpenbankStatement({ rows }))

    expect(result.movements.map((movement) => movement.daySequence)).toEqual([2, 1])
    expect(result.unparsedRows).toHaveLength(1)
  })

  it('derives the type from the sign in the single shared place: 0 is neutral', () => {
    const types = parseOpenbankStatement(buildOpenbankStatement()).movements.map(
      (movement) => movement.type,
    )

    expect(types).toEqual([
      'expense',
      'expense',
      'expense',
      'income',
      'neutral',
      'expense',
      'expense',
      'income',
    ])
  })
})

function catchAppError(run: () => unknown): { code: string; statusCode: number; message: string } {
  try {
    run()
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      return error as unknown as { code: string; statusCode: number; message: string }
    }
    throw error
  }
  throw new Error('expected an AppError, nothing was thrown')
}
