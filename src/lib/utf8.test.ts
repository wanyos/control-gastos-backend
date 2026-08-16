import { describe, expect, it } from 'vitest'

import { NotUtf8Error } from '../errors/app-error.js'
import { decodeUtf8Strict } from './utf8.js'

/**
 * Every buffer here is built byte by byte in code: nothing is copied from a real
 * file (feature 14) and nothing touches the network.
 */
describe('decodeUtf8Strict — valid UTF-8 (feature 17)', () => {
  it('decodes accents, ñ and the euro sign untouched', () => {
    const text = 'SUSCRIPCIÓN AÑO PREMIUM €'

    expect(decodeUtf8Strict(Buffer.from(text, 'utf8'))).toBe(text)
  })

  it('keeps a leading BOM instead of editing the text (the reader decides)', () => {
    const decoded = decodeUtf8Strict(Buffer.from('﻿iban;ES91', 'utf8'))

    expect(decoded).toBe('﻿iban;ES91')
  })

  it('accepts an empty file and a pure ASCII one', () => {
    expect(decodeUtf8Strict(Buffer.from([]))).toBe('')
    expect(decodeUtf8Strict(Buffer.from('Fecha;Concepto;Importe\n', 'utf8'))).toBe(
      'Fecha;Concepto;Importe\n',
    )
  })

  it('accepts a 4-byte code point (outside the BMP)', () => {
    expect(decodeUtf8Strict(Buffer.from([0xf0, 0x9f, 0x92, 0xb6]))).toBe('💶')
  })
})

describe('decodeUtf8Strict — bytes that are not UTF-8 (feature 17)', () => {
  /** The measured case: `Ó` saved as the single cp1252 byte `0xD3`. */
  const cp1252 = Buffer.concat([
    Buffer.from('iban;ES91\nSUSCRIPCI', 'utf8'),
    Buffer.from([0xd3]),
    Buffer.from('N PREMIUM\n', 'utf8'),
  ])

  it('rejects the file and names the byte, its line and what to do', () => {
    expect(() => decodeUtf8Strict(cp1252)).toThrow(NotUtf8Error)

    const error = catchError(() => decodeUtf8Strict(cp1252))
    expect(error.code).toBe('NOT_UTF8')
    expect(error.message).toContain('no está guardado en UTF-8')
    expect(error.message).toContain('0xD3')
    expect(error.message).toContain('línea 2')
    expect(error.message).toContain('vuelve a guardarlo')
  })

  it('never repairs or decodes it as cp1252: nothing is returned at all', () => {
    let returned: string | null = null
    try {
      returned = decodeUtf8Strict(cp1252)
    } catch {
      returned = null
    }

    expect(returned).toBeNull()
  })

  it('rejects a lone continuation byte, a truncated sequence, an overlong one and a surrogate', () => {
    const cases: Array<[string, Buffer]> = [
      ['lone continuation', Buffer.from([0x41, 0x80])],
      ['truncated 3-byte', Buffer.from([0xe2, 0x82])],
      ['overlong slash', Buffer.from([0xc0, 0xaf])],
      ['UTF-16 surrogate', Buffer.from([0xed, 0xa0, 0x80])],
      ['above U+10FFFF', Buffer.from([0xf5, 0x80, 0x80, 0x80])],
    ]

    for (const [name, bytes] of cases) {
      expect(() => decodeUtf8Strict(bytes), name).toThrow(NotUtf8Error)
    }
  })

  it('rejects text that already carries the replacement character', () => {
    // Valid UTF-8 bytes (ef bf bd) spelling U+FFFD: the scar of a previous
    // failed decoding, not something a bank writes.
    const scarred = Buffer.from('CONCEPTO\nSUSCRIPCI�N PREMIUM\n', 'utf8')

    const error = catchError(() => decodeUtf8Strict(scarred))
    expect(error.code).toBe('NOT_UTF8')
    expect(error.message).toContain('carácter de sustitución')
    expect(error.message).toContain('línea 2')
  })

  it('never returns a string holding a replacement character', () => {
    const inputs = [cp1252, Buffer.from([0x41, 0x80]), Buffer.from('ok�', 'utf8')]

    for (const input of inputs) {
      let decoded = ''
      try {
        decoded = decodeUtf8Strict(input)
      } catch {
        decoded = ''
      }
      expect(decoded).not.toContain('�')
    }
  })
})

function catchError(run: () => unknown): NotUtf8Error {
  try {
    run()
  } catch (error) {
    if (error instanceof NotUtf8Error) {
      return error
    }
    throw error
  }
  throw new Error('expected a NotUtf8Error, nothing was thrown')
}
