import { NotUtf8Error } from '../errors/app-error.js'

/**
 * Decodes the bytes of a file as UTF-8, REJECTING anything that is not valid
 * UTF-8 instead of mangling it (feature 17).
 *
 * Why this exists: `Buffer.toString('utf8')` never throws. A file saved as
 * cp1252 by an editor (Excel, Notepad in ANSI mode) loses every accent
 * irreversibly — `SUSCRIPCIÓN` becomes `SUSCRIPCI<U+FFFD>N` — and the parse
 * looks perfect: same row count, no extra unparsed rows. Measured on a real
 * file on 2026-08-15 (`progress/prueba-drive-real-2026-08-15.md` §E).
 *
 * The decision is to REJECT, never to guess or repair: no encoding is sniffed
 * and cp1252 is not learned. The reason says what to do (save it again as
 * UTF-8), because the human writes these files himself.
 *
 * This is encoding, not format reading: it holds no knowledge of any bank, so
 * living in `lib/` breaks no "one parser per bank" rule and both callers of a
 * parser (the local parse run and the importer) get the guard for free.
 *
 * The BOM is NOT removed here (`ignoreBOM: true`): this function only turns
 * bytes into text and a leading BOM is valid UTF-8. Whoever reads the format
 * decides what to do with it.
 */
export function decodeUtf8Strict(content: Buffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content)
  } catch {
    throw new NotUtf8Error(invalidBytesReason(content))
  }

  // Second, narrower guard: the bytes ARE valid UTF-8 but they spell out the
  // replacement character. That is not a character anybody types; it is the
  // scar of an earlier failed decoding (the file was read wrong and saved back
  // as UTF-8), so the text is already corrupted and rejecting it is the same
  // decision as above. The verdict, though, is the byte-level one: a file is
  // rejected because its bytes are not UTF-8, and only then because it carries
  // this evidence.
  const scar = text.indexOf(replacementCharacter)
  if (scar !== -1) {
    throw new NotUtf8Error(
      `el archivo contiene el carácter de sustitución � (línea ${lineOf(text, scar)}), ` +
        'rastro de una decodificación fallida anterior: vuelve a exportarlo del banco y ' +
        'guárdalo con codificación UTF-8',
    )
  }

  return text
}

const replacementCharacter = '�'

/** Builds the reason of a rejection, pointing at the first offending byte. */
function invalidBytesReason(content: Buffer): string {
  const invalid = findInvalidByte(content)
  const where =
    invalid === null
      ? ''
      : ` (byte ${toHex(invalid.byte)} no válido en la línea ${lineOfByte(content, invalid.index)})`

  return (
    `el archivo no está guardado en UTF-8${where}: vuelve a guardarlo con codificación ` +
    'UTF-8 («CSV UTF-8» si lo editas con Excel) y súbelo otra vez'
  )
}

interface InvalidByte {
  /** 0-based position of the byte that starts the invalid sequence. */
  index: number
  byte: number
}

/**
 * Finds the first byte that cannot start (or complete) a valid UTF-8 sequence,
 * only to name it in the reason: the verdict is `TextDecoder`'s. It rejects the
 * same things the decoder does — lone continuation bytes, truncated sequences,
 * overlong encodings, surrogates and code points above U+10FFFF — and always
 * reports the byte that STARTS the bad sequence, which is the one the human can
 * recognize (`0xD3` is the cp1252 `Ó`).
 */
function findInvalidByte(bytes: Buffer): InvalidByte | null {
  let index = 0

  while (index < bytes.length) {
    const lead = bytes[index]
    if (lead < 0x80) {
      index++
      continue
    }

    const size = sequenceSize(lead)
    if (size === 0 || index + size > bytes.length) {
      return { index, byte: lead }
    }

    let codePoint = lead & (0xff >> (size + 1))
    for (let offset = 1; offset < size; offset++) {
      const continuation = bytes[index + offset]
      if ((continuation & 0xc0) !== 0x80) {
        return { index, byte: lead }
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f)
    }

    if (isOutOfRange(codePoint, size)) {
      return { index, byte: lead }
    }
    index += size
  }

  return null
}

/** Length of the sequence a lead byte announces, or `0` if it cannot lead one. */
function sequenceSize(lead: number): number {
  if (lead >= 0xc2 && lead <= 0xdf) return 2
  if (lead >= 0xe0 && lead <= 0xef) return 3
  if (lead >= 0xf0 && lead <= 0xf4) return 4
  return 0
}

/** Overlong encodings, UTF-16 surrogates and anything above U+10FFFF. */
function isOutOfRange(codePoint: number, size: number): boolean {
  if (size === 3) {
    return codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  }
  if (size === 4) {
    return codePoint < 0x10000 || codePoint > 0x10ffff
  }
  return false
}

function toHex(byte: number): string {
  return `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`
}

/** 1-based line of a byte position, counting the `\n` before it. */
function lineOfByte(bytes: Buffer, index: number): number {
  let line = 1
  for (let position = 0; position < index; position++) {
    if (bytes[position] === 0x0a) line++
  }
  return line
}

/** 1-based line of a character position inside the decoded text. */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}
