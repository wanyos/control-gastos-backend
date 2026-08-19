// Decoding the bytes a bank emits in cp1252 (feature 19).
//
// THE SCOPE OF THE UTF-8 RULE, which this file is the second half of (ADR-022):
//
//   What the HUMAN writes is saved in UTF-8 — feature 17, ADR-018, unchanged:
//   `decodeUtf8Strict` still rejects a statement he saved as ANSI.
//   What the BANK emits is decoded with the encoding OF THAT BANK, declared
//   explicitly by its parser.
//
// The three prohibitions of ADR-018 stay in force here: no encoding is sniffed,
// there is no fallback chain and nothing is repaired. Which encoding to expect
// is a decision written in the parser, and whether the file honours it is
// checked against what the FILE ITSELF declares — never guessed from its bytes.
//
// It lives in `lib/` and not inside a bank module for the same reason
// `utf8.ts` does (ADR-018 decision 3): an encoding is not a format, it holds no
// knowledge of any bank, so sharing it breaks no "one parser per bank" rule.
import { UnexpectedEncodingError } from '../errors/app-error.js'
import { assertNoReplacementCharacter } from './utf8.js'

/**
 * Decodes the bytes of a file as windows-1252 (the superset of latin-1 that
 * Spanish banking exports actually use), rejecting anything the table cannot
 * turn into text.
 *
 * `fatal: true` is declared for honesty, not for protection: MEASURED on Node 24,
 * windows-1252 maps ALL 256 bytes (the five unassigned ones come out as their C1
 * control), so this decoder never actually throws. That is exactly why the two
 * other guards are not optional:
 *
 *  - the scar guard below is the ONLY layer here that catches a `U+FFFD` already
 *    baked into the file by an earlier failed decoding — without it a concept
 *    could reach the dump with a scar inside, which is the one thing feature 17
 *    exists to prevent and which this feature must not weaken;
 *  - and the declared-charset check of the bank module is the only layer that
 *    catches the file arriving in ANOTHER encoding (see below).
 *
 * What this function does NOT do, on purpose: decide whether cp1252 is the right
 * encoding for the file. Reading text as cp1252 when it was written in UTF-8
 * produces mojibake WITHOUT a single invalid byte (`Ó` reads back as `Ã“`), so
 * no byte-level check can catch it. That verdict belongs to whoever reads the
 * format, by looking at what the file DECLARES (`readDeclaredCharset` in the
 * bank module), and it is why this decoder alone is not the whole guard.
 */
export function decodeCp1252Strict(content: Buffer): string {
  let text: string
  try {
    text = new TextDecoder('windows-1252', { fatal: true }).decode(content)
  } catch {
    throw new UnexpectedEncodingError(
      'el archivo no se puede leer en la codificación que emite este banco (cp1252): ' +
        'vuelve a descargarlo del banco sin abrirlo ni volver a guardarlo con Excel',
    )
  }

  assertNoReplacementCharacter(
    text,
    (line) =>
      new UnexpectedEncodingError(
        `el archivo contiene el carácter de sustitución � (línea ${line}), ` +
          'rastro de una decodificación fallida anterior: vuelve a descargarlo del banco ' +
          'y súbelo tal cual, sin abrirlo con Excel',
      ),
  )

  return text
}

/**
 * What the bytes say about a file that DECLARES a single-byte encoding of the
 * cp1252 family (feature 22).
 *
 * `null` means «nothing contradicts the declaration». A value means the file was
 * re-saved in UTF-8 by an editor, keeping the old declaration.
 */
export interface ResaveAsUtf8 {
  /**
   * 1-based line of the first `U+FFFD` of the UTF-8 reading, or `null` when
   * there is none. When it is not null the accented characters are ALREADY LOST
   * — the editor replaced them before writing the file — and no re-encoding can
   * bring them back: the only way out is downloading the file again.
   */
  scarLine: number | null
}

/**
 * Detects the ONE encoding mismatch that can be established as a fact: a file
 * that declares cp1252 (or its `iso-8859-1` spelling) whose bytes are valid
 * UTF-8 **with multibyte sequences**.
 *
 * Measured on 2026-08-19, on the real file: the statement arrived from the bank
 * in cp1252 declaring `iso-8859-1`; the human opened it in Visual Studio Code to
 * add the IBAN comment and hit save. The editor read it as UTF-8, turned its 8
 * accented bytes into `U+FFFD` and saved it back **as UTF-8**, leaving the
 * `<meta>` untouched. Decoded as cp1252 — which is what the file still claims —
 * the header became `Fecha Operaci<U+FFFD>n` and the parser rejected the file
 * saying it was not a statement of this bank. Loud, but false.
 *
 * WHY THIS IS NOT GUESSING AN ENCODING, which ADR-018 forbids and this function
 * must not smuggle back in. Nothing is sniffed and no fallback is chained: the
 * declaration still decides how the file is read, and this is a check of
 * CONSISTENCY between what the file affirms and what its bytes can possibly be.
 * The signal is one-directional and provable:
 *
 *  - A cp1252 file WITH accents is essentially never valid UTF-8. In cp1252 each
 *    accented letter is one byte in `0xC0-0xFF`, and UTF-8 demands that such a
 *    lead byte be followed by a continuation byte in `0x80-0xBF` — which in
 *    cp1252 is the small block of quotes, dashes and the euro sign. For a false
 *    positive EVERY non-ASCII byte of the WHOLE file would have to fall into
 *    such a pair (`Ã` + `“`, and no other neighbour anywhere), which is not
 *    Spanish and not what a bank prints.
 *  - A pure ASCII file returns `null` and is left alone, on purpose: below `0x80`
 *    the two encodings are byte-for-byte identical, so there is no reading that
 *    could differ and therefore no possible damage to protect against. That is
 *    also why the check cannot be «has no accents → suspicious».
 *
 * The opposite direction is NOT decidable and is not attempted: UTF-8 text read
 * as cp1252 is mojibake without a single invalid byte, which is why the declared
 * charset is checked separately by the parser (ADR-022).
 */
export function detectResaveAsUtf8(content: Buffer): ResaveAsUtf8 | null {
  if (!content.some((byte) => byte >= 0x80)) {
    return null
  }

  let asUtf8: string
  try {
    asUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content)
  } catch {
    // The bytes are NOT valid UTF-8, which is exactly what a cp1252 file with
    // accents looks like: the file backs its own declaration up.
    return null
  }

  const scar = asUtf8.indexOf('\uFFFD')
  return { scarLine: scar === -1 ? null : asUtf8.slice(0, scar).split('\n').length }
}
