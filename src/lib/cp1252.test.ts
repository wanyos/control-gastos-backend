import { describe, expect, it } from 'vitest'

import { NotUtf8Error, UnexpectedEncodingError } from '../errors/app-error.js'
import { decodeCp1252Strict, detectResaveAsUtf8 } from './cp1252.js'
import { assertNoReplacementCharacter, decodeUtf8Strict } from './utf8.js'

/**
 * Every buffer here is built byte by byte in code: nothing is copied from a real
 * file (feature 14) and nothing touches the network.
 */
describe('decodeCp1252Strict — the encoding the bank emits (R2)', () => {
  it('decodes the accented bytes of a Spanish export as the characters they are', () => {
    // cp1252 writes each of these as ONE byte, which is what makes them invalid
    // UTF-8: `ó` = 0xF3, `é` = 0xE9, `í` = 0xED, `ú` = 0xFA, `º` = 0xBA.
    const bytes = Buffer.from([0xf3, 0xe9, 0xed, 0xfa, 0xba])

    expect(decodeCp1252Strict(bytes)).toBe('óéíúº')
  })

  it('decodes the euro sign, which is cp1252 and NOT latin-1 (0x80)', () => {
    expect(decodeCp1252Strict(Buffer.from([0x80]))).toBe('€')
  })

  it('leaves pure ASCII identical, byte for byte', () => {
    const ascii = '<td>17/08/2026</td><td>-19,84</td>'

    expect(decodeCp1252Strict(Buffer.from(ascii, 'ascii'))).toBe(ascii)
  })

  it('accepts an empty file', () => {
    expect(decodeCp1252Strict(Buffer.from([]))).toBe('')
  })

  it('maps every one of the 256 bytes, which is WHY R3 exists', () => {
    // Measured, not assumed: windows-1252 has a character for all 256 bytes (the
    // five unassigned ones come out as their C1 control), so decoding can never
    // fail on its own. A file that arrived in another encoding would therefore
    // be read WITHOUT a single error — the reason the parser demands the file
    // DECLARE its charset instead of trusting the decoder.
    const everyByte = Buffer.from(Array.from({ length: 256 }, (_, byte) => byte))

    expect(decodeCp1252Strict(everyByte)).toHaveLength(256)
  })
})

describe('decodeCp1252Strict — the scar of an earlier failed decoding (R3)', () => {
  /**
   * A `U+FFFD` already inside the file, written as the three UTF-8 bytes an
   * earlier failed decoding leaves behind.
   */
  const scarred = Buffer.concat([
    Buffer.from('linea uno\nCONCEPTO ', 'ascii'),
    Buffer.from([0xef, 0xbf, 0xbd]),
    Buffer.from('N\n', 'ascii'),
  ])

  it('never lets a replacement character through into the decoded text', () => {
    // This is the guarantee the criterion asks for: no concept reaches the dump
    // with a `U+FFFD` inside. It holds for every input, valid or not.
    for (const input of [
      scarred,
      Buffer.from([0xd3]),
      Buffer.from([]),
      Buffer.from('ok', 'ascii'),
    ]) {
      let decoded = ''
      try {
        decoded = decodeCp1252Strict(input)
      } catch {
        decoded = ''
      }
      expect(decoded).not.toContain('�')
    }
  })

  it('shows WHY the guard alone cannot be the whole protection here', () => {
    // No byte of cp1252 maps to `U+FFFD`, so those three bytes come out as the
    // visible mojibake below instead of firing the guard. The wiring stays (it
    // costs nothing and it is the same doctrine as UTF-8), but the layer that
    // really protects this bank is the DECLARED charset of R3, checked by the
    // parser — not anything the decoder can see in the bytes.
    expect(decodeCp1252Strict(scarred)).toContain('ï¿½')
  })
})

describe('assertNoReplacementCharacter — the guard shared by both decoders (T2)', () => {
  it('does nothing on clean text', () => {
    expect(() =>
      assertNoReplacementCharacter('texto limpio', () => new Error('boom')),
    ).not.toThrow()
  })

  it('lets the CALLER own the error, because the code belongs to the encoding', () => {
    const utf8Error = catchAny(() =>
      assertNoReplacementCharacter('a\n\uFFFD', (line) => new NotUtf8Error(`utf8 línea ${line}`)),
    )
    const cp1252Error = catchAny(() =>
      assertNoReplacementCharacter(
        'a\n\uFFFD',
        (line) => new UnexpectedEncodingError(`cp1252 línea ${line}`),
      ),
    )

    expect(utf8Error).toBeInstanceOf(NotUtf8Error)
    expect(utf8Error.message).toBe('utf8 línea 2')
    expect(cp1252Error).toBeInstanceOf(UnexpectedEncodingError)
    expect(cp1252Error.message).toBe('cp1252 línea 2')
  })
})

describe('the two decoders stay independent (R2: MyInvestor is not weakened)', () => {
  it('what one bank accepts, the other still rejects, and the other way round', () => {
    const cp1252Bytes = Buffer.from([0xd3]) // `Ó` as cp1252 writes it
    const utf8Bytes = Buffer.from('Ó', 'utf8')

    expect(decodeCp1252Strict(cp1252Bytes)).toBe('Ó')
    expect(() => decodeUtf8Strict(cp1252Bytes)).toThrow(NotUtf8Error)

    expect(decodeUtf8Strict(utf8Bytes)).toBe('Ó')
    // Read as cp1252 the same character comes out as mojibake, with NO error at
    // all: this is why a parser cannot decide its encoding from the bytes, and
    // why the file has to DECLARE it (R3).
    expect(decodeCp1252Strict(utf8Bytes)).toBe('Ã“')
  })
})

/**
 * Feature 22. The signal is one single fact — «these bytes are valid UTF-8 and
 * carry multibyte sequences, so a cp1252 export did not write them» — and these
 * tests are what makes it a fact instead of a hunch: the false positives are
 * looked for on purpose, not assumed away.
 */
describe('detectResaveAsUtf8 — declaring one encoding and arriving in another (C4)', () => {
  it('says nothing about a legitimate cp1252 export with accents', () => {
    // Every accented letter is ONE byte in 0xC0-0xFF with an ASCII letter next
    // to it, which UTF-8 cannot read: the file backs its own declaration up.
    const legitimate = Buffer.from(
      [...'GESTIÓN AÑO ÚNICO ÁEÍÓÚ Ñ óéíúº'].map((character) => character.codePointAt(0) ?? 0),
    )

    expect(detectResaveAsUtf8(legitimate)).toBeNull()
  })

  it('says nothing about a pure ASCII file, where the two readings are the same bytes', () => {
    // Below 0x80 cp1252 and UTF-8 are identical, so no reading could differ and
    // there is no damage to protect against. Rejecting it would be a false
    // positive on the most common file there is.
    expect(
      detectResaveAsUtf8(Buffer.from('<td>17/08/2026</td><td>-19,84</td>', 'ascii')),
    ).toBeNull()
    expect(detectResaveAsUtf8(Buffer.from([]))).toBeNull()
  })

  it('catches a file whose accents travel as UTF-8 multibyte sequences', () => {
    expect(detectResaveAsUtf8(Buffer.from('GESTIÓN AÑO', 'utf8'))).toEqual({ scarLine: null })
  })

  it('reports the line of the first replacement character when the accents are already gone', () => {
    // What an editor leaves behind: the accented byte is already lost and only
    // the scar was written, in UTF-8.
    const scarred = Buffer.concat([
      Buffer.from('linea uno\nCONCEPTO ', 'ascii'),
      Buffer.from('\uFFFD', 'utf8'),
      Buffer.from('N\n', 'ascii'),
    ])

    expect(detectResaveAsUtf8(scarred)).toEqual({ scarLine: 2 })
  })

  it('never fires on the accented text of a Spanish statement written in cp1252', () => {
    // The false-positive hunt, done by brute force rather than by argument: for
    // EVERY accented character this bank can print, in every position of a short
    // ASCII sentence, the cp1252 bytes must stay undetected.
    const accents = [...'ÁÉÍÓÚÜÑáéíóúüñªº€·']
    for (const accent of accents) {
      for (const position of [0, 5, 11]) {
        const sentence = `PAGO ${accent}RECIBO DE PRUEBA`
        const text = sentence.slice(0, position) + accent + sentence.slice(position)

        expect(detectResaveAsUtf8(toCp1252(text))).toBeNull()
      }
    }
  })

  it('does not learn cp1252 nor repair anything: it only returns a verdict', () => {
    const utf8 = Buffer.from('GESTIÓN', 'utf8')
    const before = Buffer.from(utf8)

    detectResaveAsUtf8(utf8)

    expect(utf8.equals(before)).toBe(true)
  })
})

/**
 * cp1252 bytes of a piece of Spanish text, written here and not imported from a
 * bank fixture: `lib/` knows no bank (there is a guardian in
 * `architecture.test.ts` that checks precisely that). Latin-1 code points are
 * their own byte; the euro sign lives at 0x80.
 */
function toCp1252(text: string): Buffer {
  return Buffer.from(
    [...text].map((character) => {
      if (character === '€') return 0x80
      const code = character.codePointAt(0) ?? 0
      if (code > 0xff) throw new Error(`character '${character}' is not cp1252`)
      return code
    }),
  )
}

function catchAny(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    throw error
  }
  throw new Error('expected an error, nothing was thrown')
}
