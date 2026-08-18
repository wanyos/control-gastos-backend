// Feature 21 `iban-normalization`. Criteria C1, C2, C3, C4 and C7.
//
// 🔒 Every IBAN written down here is SYNTHETIC and its check digits were
// COMPUTED, never copied: the German one has an all-zero body (nobody's
// account) and the two Spanish ones are the public examples already on the
// allow-list of `src/no-real-data.test.ts`. Nothing reaches the network and
// nothing is read from disk except this repository's own sources.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { InvalidIbanError } from '../errors/app-error.js'
import { mistypedIban, syntheticIban } from './iban.fixture.js'
import {
  ibanRejectionReason,
  isValidIban,
  normalizeIban,
  readPreambleIban,
  requireValidIban,
} from './iban.js'

/** Public example IBAN of the Spanish documentation; nobody's account. */
const spanishExample = 'ES9121000418450200051332'
/** Invented German IBAN: all-zero body, check digits computed for it. */
const germanExample = 'DE36000000000000000000'

const libDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const srcDir = join(libDir, '..')

describe('normalizeIban — the same IBAN can only be one string (C2)', () => {
  it('removes the INTERIOR spaces a human writes when grouping in fours', () => {
    expect(normalizeIban('DE36 0000 0000 0000 0000 00')).toBe(germanExample)
    expect(normalizeIban('ES91 2100 0418 4502 0005 1332')).toBe(spanishExample)
  })

  it('uppercases, so lowercase and uppercase are the same account', () => {
    expect(normalizeIban('de36 0000 0000 0000 0000 00')).toBe(germanExample)
    expect(normalizeIban(germanExample.toLowerCase())).toBe(germanExample)
  })

  it('produces EXACTLY the same string from the spaced and the unspaced form', () => {
    expect(normalizeIban('de36 0000 0000 0000 0000 00')).toBe(normalizeIban(germanExample))
  })

  it('removes tabs, newlines and leading/trailing blanks too', () => {
    expect(normalizeIban(`\t ${spanishExample.slice(0, 4)} \n${spanishExample.slice(4)} `)).toBe(
      spanishExample,
    )
  })

  it('is IDEMPOTENT: an already-clean IBAN comes out untouched (C7)', () => {
    // This is the whole technical argument for writing no migration: the two
    // accounts stored today are already normalized, so the normalizer maps them
    // to themselves. See progress/implementations/iban-normalization.md.
    for (const iban of [spanishExample, germanExample, 'ES9820385778983000760236']) {
      expect(normalizeIban(iban)).toBe(iban)
      expect(normalizeIban(normalizeIban(iban))).toBe(iban)
    }
  })
})

describe('ibanRejectionReason — what "a valid IBAN" means (C3)', () => {
  it('accepts a well-formed IBAN however it is spaced or cased', () => {
    for (const written of [
      spanishExample,
      'ES91 2100 0418 4502 0005 1332',
      'es9121000418450200051332',
      germanExample,
      'de36 0000 0000 0000 0000 00',
    ]) {
      expect(ibanRejectionReason(written)).toBeNull()
      expect(isValidIban(written)).toBe(true)
    }
  })

  it('names an empty value by its problem', () => {
    expect(ibanRejectionReason('   ')).toBe('está vacío')
  })

  it('names a wrong SHAPE by its problem', () => {
    for (const wrong of [
      'not-an-iban',
      '9121000418450200051332',
      'E91210004184502000513',
      'ES9A21000418450200051332',
    ]) {
      expect(ibanRejectionReason(wrong)).toContain('no tiene la forma de un iban')
    }
  })

  it('names a wrong LENGTH FOR ITS COUNTRY by its problem', () => {
    expect(ibanRejectionReason(`${spanishExample}00`)).toBe(
      'un iban de ES tiene 24 caracteres y este tiene 26',
    )
    expect(ibanRejectionReason(spanishExample.slice(0, 22))).toContain('un iban de ES tiene 24')
    expect(ibanRejectionReason(`${germanExample}0`)).toContain('un iban de DE tiene 22')
  })

  it('names a CHECK DIGIT that does not add up by its problem — the mistyped digit', () => {
    expect(ibanRejectionReason(mistypedIban(spanishExample))).toBe('el dígito de control no cuadra')
    expect(ibanRejectionReason(mistypedIban(germanExample))).toBe('el dígito de control no cuadra')
  })

  it('catches the mistyped digit of 500 generated IBANs, of two countries', () => {
    for (let index = 0; index < 250; index += 1) {
      for (const [country, length] of [
        ['ES', 20],
        ['DE', 18],
      ] as const) {
        const good = syntheticIban(country, length)
        expect(isValidIban(good)).toBe(true)
        expect(isValidIban(mistypedIban(good))).toBe(false)
      }
    }
  })

  it('checks only the shape and the check digits of a country it does not know', () => {
    // The length table is deliberately non-exhaustive: an unknown country is not
    // rejected for its length, only for the generic 15–34 range.
    expect(ibanRejectionReason('ZZ001234')).toContain('un iban tiene entre 15 y 34 caracteres')
    expect(ibanRejectionReason(`ZZ00${'0'.repeat(40)}`)).toContain('un iban tiene entre 15 y 34')
  })

  it('never echoes the IBAN in the reason: it is an account number', () => {
    for (const wrong of [mistypedIban(spanishExample), `${spanishExample}00`, 'ES91-nope']) {
      expect(ibanRejectionReason(wrong)).not.toContain('ES91')
    }
  })
})

describe('requireValidIban and readPreambleIban — the rejection (C4)', () => {
  it('returns the NORMALIZED IBAN when it is valid', () => {
    expect(requireValidIban('es91 2100 0418 4502 0005 1332')).toBe(spanishExample)
  })

  it('throws InvalidIbanError with the stable code and 422', () => {
    const failure = (() => {
      try {
        requireValidIban(mistypedIban(germanExample))
        return null
      } catch (error) {
        return error
      }
    })()

    expect(failure).toBeInstanceOf(InvalidIbanError)
    expect((failure as InvalidIbanError).code).toBe('INVALID_IBAN')
    expect((failure as InvalidIbanError).statusCode).toBe(422)
  })

  it('says WHICH LINE of the file is wrong and WHY, by its name', () => {
    expect(() => readPreambleIban({ line: 2, value: mistypedIban(germanExample) })).toThrowError(
      'el iban de la línea 2 no es válido: el dígito de control no cuadra',
    )
  })

  it('reads an absent or empty preamble line as null, never as a failure', () => {
    expect(readPreambleIban(null)).toBeNull()
    expect(readPreambleIban({ line: 1, value: '' })).toBeNull()
    expect(readPreambleIban({ line: 1, value: '   ' })).toBeNull()
  })

  it('normalizes the value of the line the human wrote with spaces and lowercase', () => {
    expect(readPreambleIban({ line: 1, value: ' de36 0000 0000 0000 0000 00 ' })).toBe(
      germanExample,
    )
  })
})

describe('one single normalizer, shared by the three banks and the accounts door (C1)', () => {
  const bankParsers = [
    'modules/bankinter/bankinter.parser.ts',
    'modules/myinvestor/myinvestor.statement.parser.ts',
    'modules/n26/n26.statement.parser.ts',
  ]

  it('is used by the parser of every bank', () => {
    for (const parser of bankParsers) {
      const source = readFileSync(join(srcDir, parser), 'utf8')
      expect(source).toContain("from '../../lib/iban.js'")
      expect(source).toContain('readPreambleIban(')
    }
  })

  it('is used by POST /api/accounts and by the auto-creation from a statement', () => {
    const source = readFileSync(join(srcDir, 'modules/accounts/accounts.service.ts'), 'utf8')
    expect(source).toContain("from '../../lib/iban.js'")
    expect(source).toContain('requireValidIban(')
    // Both entry points of the service, not just the HTTP one.
    expect(source.match(/requireValidIban\(/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('is declared in ONE file: nothing else in src/ strips spaces to uppercase an IBAN', () => {
    const duplicated = sourceFiles(srcDir)
      .filter((file) => !file.endsWith(`lib${sep}iban.ts`))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return /replace\(\/\\s\+\/g, ''\)[\s\S]{0,40}toUpperCase\(\)/.test(source)
      })
      .map((file) => relative(srcDir, file).split(sep).join('/'))

    expect(duplicated).toEqual([])
  })

  it('has no second mod-97 implementation in src/, other than the privacy guardian', () => {
    const implementations = sourceFiles(srcDir)
      // This very file is skipped because it has to SPELL the operator it looks
      // for; it implements nothing.
      .filter((file) => !file.endsWith(`lib${sep}iban.test.ts`))
      .filter((file) => /%\s*97/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcDir, file).split(sep).join('/'))
      .sort()

    // The guardian of feature 14 keeps its own copy ON PURPOSE: a test that
    // imports the code it audits stops being able to catch it.
    expect(implementations).toEqual(['lib/iban.ts', 'no-real-data.test.ts'])
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}
