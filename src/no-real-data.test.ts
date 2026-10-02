// Privacy guardian (feature 14 `no-real-data`, source changed by feature 51).
//
// It fails when a real financial datum of the owner of this project reaches a
// VERSIONED file. It lives in its own file, and not inside `architecture.test.ts`,
// because it guards the whole repository (docs, specs, progress, prisma…), not the
// shape of `src/`, and because it is the executable half of the rule written in
// `docs/conventions.md` §Tests.
//
// TWO LAYERS, on purpose:
//
//  1. BY SHAPE — always on, needs nothing from the machine: any well-formed
//     Spanish IBAN (mod-97 checksum) that is not one of the two documented
//     synthetic ones is a leak. This is the layer that protects when an agent
//     works on another machine, with an empty database.
//
//  2. BY COMPARISON against HIS DATABASE (feature 51) — amounts, texts and IBANs
//     of the compared columns listed in `src/lib/test-real-data.ts`. This file does
//     NOT open his database: `vitest.global-setup.ts` reads those columns through a
//     read-only connection and hands them over with `provide`; here they arrive
//     with `inject`. When the database has nothing of a kind, the comparison of
//     that kind SKIPS and says so on file descriptor 2; it never fails for it.
//     Until feature 51 this layer read the files of `var/`; it reads no file nor
//     folder of `var/` any more.
//
// This file is scanned like every other one: it is NOT on its own exception list.
//
// EXCEPTIONS (all of them explicit and greppable):
//   - `allowedIbans`: an IBAN that is public/invented and used as an example.
//   - `allowedPaths`: a path prefix excluded with its reason.
//   - inline marker `no-real-data-ok`: a line carrying it is skipped by the
//     comparison of amounts and of phrases. Use it for the rare false positive,
//     with the reason next to it. It never silences an IBAN, by shape or by
//     comparison.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeSync } from 'node:fs'
import { extname, join } from 'node:path'

import { describe, expect, inject, it } from 'vitest'

import type { RealDataReference } from './lib/test-real-data.js'

// `tsconfig.json` only types `src/**`, so the key `vitest.global-setup.ts`
// provides is declared here.
declare module 'vitest' {
  interface ProvidedContext {
    realDataReference: RealDataReference
  }
}

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** Well-formed IBANs that are public documentation or plainly invented. */
const allowedIbans = new Set([
  // Public example of the Spanish documentation (docs/conventions.md §Tests).
  'ES9121000418450200051332',
  // Synthetic IBAN used across fixtures and docs/api-contract.md since feature 8.
  'ES9820385778983000760236',
])

/**
 * Paths excluded from the comparison layers, each with the reason why.
 *
 * THIS FILE IS NOT ON THE LIST, on purpose (feature 14, second pass). A guardian
 * that exempts itself can never catch itself, and it did carry a real concept of
 * his inside. Every example it needs is invented: nothing here has to be true, it
 * only has to have the right SHAPE. If a real datum is ever written into this
 * file, the run fails like anywhere else.
 */
const allowedPaths: Array<{ prefix: string; reason: string }> = [
  {
    // An applied migration is immutable: Prisma keeps its checksum and editing
    // one forces `prisma migrate reset`, which drops the human's database.
    //
    // WHAT STAYS INSIDE, said plainly: a WHOLE LINE of his statement in a SQL
    // comment (real concept, real amount, real date and how many times it
    // repeated). It is not "a bank name". Nothing else in that folder.
    // How to close it: sanitise the comment the day the database is reset for
    // another reason (the imports are re-runnable from Drive), or edit the
    // comment and fix the stored checksum by hand. Both are the human's call.
    prefix: 'prisma/migrations/',
    reason: 'applied migrations are immutable (Prisma checksums them)',
  },
]

const scannedExtensions = new Set(['.ts', '.js', '.md', '.json', '.sql', '.sh', '.yml', '.yaml'])
const skipMarker = 'no-real-data-ok'

function isAllowedPath(file: string): boolean {
  return allowedPaths.some((entry) => file.startsWith(entry.prefix))
}

/**
 * Every file git tracks PLUS every new file that is not gitignored, as
 * repo-relative POSIX paths. The second half matters: a leak has to be caught in
 * the working tree, before the commit, which is where the reviewer reads it.
 *
 * A tracked file deleted from the working tree is still listed here; it is
 * dropped by `versionedSources`, when reading it says it is not there.
 */
function versionedFiles(): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return listed
    .split('\0')
    .filter(Boolean)
    .filter((file) => scannedExtensions.has(extname(file).toLowerCase()))
}

/**
 * OUR OWN WORDS INSIDE HIS DATA (feature 24, kept by feature 51).
 *
 * `ImportUnparsedRow.reason` is not a copy of his statement: it is the sentence OUR
 * parser wrote about a row it could not read — «se espera el formato AAAA-MM-DD» —
 * and the documentation publishes those same sentences word for word, because they
 * are ours to publish. Read as «a phrase of his copied into the docs» they flood the
 * run with false warnings (270 in one run, when the same messages lived in the dump
 * of `var/parsed/`).
 *
 * WHERE THE LINE IS DRAWN, and why it does not open a hole:
 *
 *  - It is NOT drawn per COLUMN. Dropping the whole message would stop watching the
 *    values of his that it carries INSIDE it.
 *  - It is drawn per PHRASE, and only where TWO independent conditions agree:
 *      (a) the phrase is NOT part of a value echoed from his file. Every echoed value
 *          is quoted, by the convention every parser follows (`display()` quotes as
 *          JSON, the rest interpolate between `'…'`), and what is quoted is LIFTED
 *          into the watched bucket, no questions asked; AND
 *      (b) the phrase is LITERALLY IN OUR SOURCE: it appears among the message
 *          literals of our own production code (`ownSourceVocabulary`).
 *    Both, never one. A datum of his echoed without quotes fails (b) and stays
 *    watched; a sentence of ours quoted by accident fails (a) and stays watched.
 *
 *    AND THE MESSAGE IS NEVER CHOPPED UP TO ASK THE QUESTION (fixed 2026-08-20 after
 *    the review of feature 24). It used to be: the message was cut at the quotes and
 *    only the pieces BETWEEN them were asked about — so a value of his carrying an
 *    APOSTROPHE (`COMPRA D'ALIMENTS…`, and there are apostrophes in real card concepts)
 *    mis-cut the message, each half landed in a different bucket, neither half reached
 *    three words, and the value STOPPED BEING COMPARED. Now the WHOLE message is asked
 *    about as ONE string and the quoted spans are added ON TOP: the split can only ADD
 *    to what is compared, never take a character away from it.
 *
 *  - AND THE AMOUNTS OF A MESSAGE ARE WATCHED WITH NO SPLIT AT ALL: every amount
 *    written inside one of those messages is compared like the amounts of the money
 *    columns (`comparisonOf`). The line drawn here is only about WORDS.
 */
interface CaptureSources {
  /**
   * His: ONE ENTRY PER VALUE, never a single blob. Joining the values and reading
   * trigrams across the seam invents phrases that are written in NO value of his. A
   * phrase of his lives INSIDE one value.
   */
  data: string[]
  /**
   * Ours: each of our messages WHOLE, one entry per message. Whole, and not cut at the
   * quotes, because a cut can lose a phrase that straddles it — see `echoedSpans`.
   * Everything here is still compared; it is only asked, phrase by phrase, whether our
   * own source proves we wrote it.
   */
  ourProse: string[]
}

/**
 * The spans of one of our messages that are QUOTED — `'…'`, `"…"` or `«…»` — which is
 * how every parser echoes a value taken from his file.
 *
 * WHAT THIS FUNCTION IS ALLOWED TO BE: WRONG. Quoting is a convention, and a value of
 * his can carry a quote inside it (`COMPRA D'ALIMENTS…`), so any cut made here can land
 * in the wrong place. That is why the caller does not USE this to decide what to leave
 * out: it keeps the whole message anyway and adds these spans ON TOP, in the bucket that
 * is compared with no questions asked. So a mis-cut can only make the guardian compare
 * a substring twice — never make it compare one character less.
 *
 * The review of this feature found the earlier version doing the opposite (it cut the
 * message in two buckets, and an apostrophe made a whole concept disappear from both):
 * a silence, in the one place whose comment promised there could not be one.
 */
function echoedSpans(message: string): string[] {
  return [...message.matchAll(/'[^']*'|"[^"]*"|«[^»]*»/g)].map((match) => match[0].slice(1, -1))
}

/**
 * The reference split in two: what is his and what is ours. The text columns are his,
 * one entry per value; each of our messages goes WHOLE on one side and whatever it
 * quotes is lifted to the other. Both, so that no cut of ours can lose a phrase of his.
 */
function referencePhraseSources(reference: RealDataReference): CaptureSources {
  return {
    data: [...reference.texts, ...reference.ownMessages.flatMap((message) => echoedSpans(message))],
    ourProse: [...reference.ownMessages],
  }
}

/**
 * The message literals of one of our source files, as prose.
 *
 * `${…}` goes first: what is interpolated is a VALUE, ours or his, never our words —
 * and dropping it makes the source read like the stored message, where `words()` throws digits
 * away too. Then literals glued with `+` are joined back into ONE message, because a
 * sentence split across three lines by the formatter is still one sentence in the stored message.
 */
function ownMessageProse(source: string): string[] {
  const glued = source.replace(/\$\{[^{}]*\}/g, ' ').replace(/(['"`])\s*\+\s*(['"`])/g, '')
  return [...glued.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  )
}

/**
 * Our PRODUCTION code only: tests and fixtures are excluded on purpose. A message is
 * born in the parser that composes it; a test is a place where a phrase gets COPIED,
 * and treating a copy as proof of ownership is how a leak pasted into a fixture (which
 * is exactly what feature 19 was) would certify itself as «our words».
 */
function isOwnSource(file: string): boolean {
  return /^src\/.*\.ts$/.test(file) && !/\.(test|fixture)\.ts$/.test(file)
}

/**
 * OUR VOCABULARY, in two shapes, both read from the SAME place — the message literals
 * of our production code — so there is one source of truth for «we wrote this».
 *
 *  - `phrases`: the exact three-word sequences of our messages.
 *  - `words`: every word those literals use, field names included (`'openedAt'` is a
 *    literal in the parser too). It is needed because a message is composed AROUND its
 *    interpolations: the source says «${key}: fecha inválida» and the stored message says
 *    «openedAt: fecha inválida», a sequence that is nowhere in the source and is ours
 *    all the same. A trigram made ENTIRELY of our vocabulary is ours; one single word
 *    of his — a product name, a concept — and it stays watched.
 */
interface OwnVocabulary {
  phrases: Set<string>
  words: Set<string>
}

function ownSourceVocabulary(
  sources: SourceFile[] = versionedSources().filter((source) => isOwnSource(source.file)),
): OwnVocabulary {
  const phrases = new Set<string>()
  const vocabulary = new Set<string>()
  for (const source of sources) {
    for (const message of ownMessageProse(source.text)) {
      for (const trigram of trigramsOf(message)) phrases.add(trigram)
      for (const word of words(message)) vocabulary.add(word)
    }
  }
  return { phrases, words: vocabulary }
}

/** Ours when our own source proves it, by either shape. Never by default. */
function isOurOwnPhrase(phrase: string, own: OwnVocabulary): boolean {
  if (own.phrases.has(phrase)) return true
  return phrase.split(' ').every((word) => own.words.has(word))
}

/**
 * The phrases the guardian compares the repository against: his, plus whatever of our
 * own prose we cannot PROVE we wrote. Silence is never the default here — a phrase is
 * dropped only when it is found in our own source, one by one.
 */
function comparablePhrases(sources: CaptureSources, own: OwnVocabulary): string[] {
  const phrases = new Set<string>()
  for (const value of sources.data) {
    for (const phrase of tellingPhrases(value)) phrases.add(phrase)
  }
  for (const chunk of sources.ourProse) {
    for (const phrase of tellingPhrases(chunk)) {
      if (!isOurOwnPhrase(phrase, own)) phrases.add(phrase)
    }
  }
  return [...phrases]
}

// The first alternative catches the thousands separator written as a SPACE
// (`9 876,54`), which is how prose tends to quote an amount and how a leak got
// past the first sweep of feature 14.
const numberPattern = /\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?|-?\d[\d.,]*\d|-?\d/g

/** Reads `9.876,54`, `9876.54`, `9876,54` and `9 876,54` as the same number. */
function toNumber(token: string): number | null {
  let body = token.replace(/^-/, '').replace(/ /g, '')
  const comma = body.lastIndexOf(',')
  const dot = body.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    body = body.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.')
  } else if (comma >= 0) {
    const decimals = body.length - comma - 1
    body = decimals === 1 || decimals === 2 ? body.replace(',', '.') : body.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = body.length - dot - 1
    if (decimals !== 1 && decimals !== 2) body = body.replace(/\./g, '')
  }
  const value = Number(body)
  return Number.isFinite(value) ? Math.abs(value) : null
}

function significantDigits(value: number): number {
  return value.toFixed(4).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length
}

/**
 * An amount worth comparing: at least 4 significant digits, so that a collision
 * with an invented figure is unlikely, and not a year (`2026` is everywhere).
 */
function isTelling(value: number | null): value is number {
  if (value === null || value <= 0) return false
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return false
  return significantDigits(value) >= 4
}

function amountsOf(text: string): Set<number> {
  const amounts = new Set<number>()
  for (const match of text.matchAll(numberPattern)) {
    const value = toNumber(match[0])
    if (isTelling(value)) amounts.add(Number(value.toFixed(4)))
  }
  return amounts
}

const stopWords = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'un',
  'una',
  'y',
  'o',
  'en',
  'con',
  'sin',
  'por',
  'para',
  'que',
  'mi',
  'mis',
  'todos',
  'todas',
  'valor',
  'mercado',
  'importe',
  'total',
  'fecha',
  'fechas',
  'saldo',
  'concepto',
  'divisa',
  'euros',
  'eur',
  'cuenta',
  'cuentas',
  'banco',
  'bancos',
  'movimiento',
  'movimientos',
  'operacion',
  'operación',
  'interes',
  'interés',
  'intereses',
  'bruto',
  'brutos',
  'neto',
  'importes',
  'porcentajes',
  'principal',
  'capital',
  'capitales',
  'extracto',
  'extractos',
  'producto',
  'productos',
  'aportacion',
  'aportación',
  'aportaciones',
  'invertido',
  'efectivo',
  'ganancia',
  'ganancias',
  'perdida',
  'pérdida',
  'vencimiento',
  'deposito',
  'depósito',
  'depositos',
  'depósitos',
  'fondo',
  'fondos',
  'cartera',
  'meses',
  'mes',
  'año',
  'premium',
  'tae',
  'iban',
])

/** Words only: digits are the amount layer's business, and mixing them in here
 * turns `intereses brutos 25` into a false positive. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
}

/**
 * Three-word sequences of a value carrying at least TWO uncommon words.
 * `valor de mercado` is everyone's; a product name plus its index is only his.
 */
function tellingPhrases(text: string): string[] {
  const tokens = words(text)
  const phrases = new Set<string>()
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    const trigram = tokens.slice(index, index + 3)
    const rare = trigram.filter((token) => token.length >= 4 && !stopWords.has(token))
    if (rare.length >= 2) phrases.add(trigram.join(' '))
  }
  return [...phrases]
}

/** Every three-word sequence of a scanned chunk, telling or not. */
function trigramsOf(text: string): string[] {
  const tokens = words(text)
  const trigrams: string[] = []
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    trigrams.push(tokens.slice(index, index + 3).join(' '))
  }
  return trigrams
}

function ibansOf(text: string): string[] {
  return [...text.matchAll(/ES[\s-]?\d{2}(?:[\s-]?\d{4}){5}/g)].map((match) =>
    match[0].replace(/[\s-]/g, ''),
  )
}

function hasValidIbanChecksum(iban: string): boolean {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  const digits = [...rearranged]
    .map((character) => Number.parseInt(character, 36).toString())
    .join('')
  let remainder = 0
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

interface Finding {
  file: string
  line: number
  reason: string
}

interface SourceFile {
  file: string
  text: string
}

function versionedSources(): SourceFile[] {
  return versionedFiles().flatMap((file) => {
    try {
      return [{ file, text: readFileSync(join(repoRoot, file), 'utf8') }]
    } catch (error) {
      // Tracked by git and deleted from the working tree: nothing to scan.
      if ((error as { code?: string }).code === 'ENOENT') return []
      throw error
    }
  })
}

/**
 * Runs `check` over every line of every given file. With `window = 2` it runs it over
 * each line JOINED WITH THE NEXT ONE: prose wraps, and a concept split in two lines got
 * past the first sweep of feature 14.
 *
 * It takes the sources instead of reading the repository itself so that the MECHANISM
 * can be proved on a simulated versioned file and an invented reference, both built in
 * memory — never with a real datum inside a test.
 */
function scanSources(
  sources: SourceFile[],
  check: (text: string) => string | null,
  skipAllowedPaths: boolean,
  window = 1,
): Finding[] {
  const findings: Finding[] = []
  for (const source of sources) {
    if (skipAllowedPaths && isAllowedPath(source.file)) continue
    const lines = source.text.split(/\r?\n/)
    lines.forEach((_line, index) => {
      const chunk = lines.slice(index, index + window)
      if (skipAllowedPaths && chunk.some((text) => text.includes(skipMarker))) return
      const reason = check(chunk.join(' '))
      if (reason) findings.push({ file: source.file, line: index + 1, reason })
    })
  }
  return findings
}

function scan(
  check: (text: string) => string | null,
  skipAllowedPaths: boolean,
  window = 1,
): Finding[] {
  return scanSources(versionedSources(), check, skipAllowedPaths, window)
}

/**
 * The three leak checks, built apart from the suite so the same code that guards the
 * repository is the one the mechanism tests exercise.
 *
 * NO MESSAGE CARRIES THE VALUE. It used to echo the amount, and that message is
 * itself printed, pasted into reports and versioned: a guardian that prints his data to
 * complain about his data being printed. Where (file and line) and what kind, nothing
 * else (feature 23).
 */
const amountReason =
  'an amount on this line is in the database: it is real data, invent another one'
const phraseReason = 'a three-word sequence copied from the database (a concept of his movements?)'
const ibanReason = 'an IBAN of the database is on this line: it is real data, invent another one'

function amountLeak(secrets: Set<number>): (text: string) => string | null {
  return (text) => {
    for (const match of text.matchAll(numberPattern)) {
      const value = toNumber(match[0])
      if (isTelling(value) && secrets.has(Number(value.toFixed(4)))) return amountReason
    }
    return null
  }
}

function phraseLeak(phrases: string[]): (text: string) => string | null {
  // The chunk's own trigrams are looked UP in a set, instead of trying every phrase of
  // the reference on every line. Same verdict for a real copy —a phrase is three
  // consecutive words either way— and the cost stops depending on how much there is to
  // compare against. It is also STRICTER: `includes` matched a phrase glued to the tail
  // of a longer word.
  const wanted = new Set(phrases)
  return (text) => (trigramsOf(text).some((trigram) => wanted.has(trigram)) ? phraseReason : null)
}

/** An IBAN as it is compared: no spaces, no hyphens, upper case. */
function compactIban(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * An IBAN of the database written on a line, however it is spaced or cased. Unlike the
 * shape layer it needs no country nor checksum: it knows the exact value it looks for,
 * so an IBAN that is not Spanish is caught too.
 */
function ibanLeak(ibans: string[]): (text: string) => string | null {
  return (text) => {
    const line = compactIban(text)
    return ibans.some((iban) => line.includes(iban)) ? ibanReason : null
  }
}

function report(findings: Finding[]): string[] {
  return findings.map((finding) => `${finding.file}:${finding.line} — ${finding.reason}`).sort()
}

/** What the reference is turned into before comparing: one set per kind. */
interface Comparison {
  amounts: Set<number>
  phrases: string[]
  ibans: string[]
}

/**
 * The reference read from the database, reduced to what is worth comparing. The reader
 * hands the values RAW; the criterion (`isTelling`, `tellingPhrases`, our own
 * vocabulary) lives only here.
 *
 * The amounts are those of the money columns PLUS every amount written inside one of
 * our messages (`ImportUnparsedRow.reason`): a message carries values of his, and its
 * amounts are watched with no question about who wrote the sentence.
 */
function comparisonOf(reference: RealDataReference, own: OwnVocabulary): Comparison {
  const amounts = new Set<number>()
  for (const raw of reference.amounts) {
    const value = Math.abs(Number(raw))
    if (Number.isFinite(value) && isTelling(value)) amounts.add(Number(value.toFixed(4)))
  }
  for (const message of reference.ownMessages) {
    for (const amount of amountsOf(message)) amounts.add(amount)
  }

  return {
    amounts,
    phrases: comparablePhrases(referencePhraseSources(reference), own),
    ibans: [...new Set(reference.ibans.map((iban) => compactIban(iban)))].filter(
      (iban) => iban.length > 0 && !allowedIbans.has(iban),
    ),
  }
}

type ComparedKind = 'amounts' | 'phrases' | 'IBAN'

/** The kinds the database gives nothing to compare against: no rows, or no tables. */
function kindsWithNothingToCompare(comparison: Comparison): ComparedKind[] {
  const kinds: ComparedKind[] = []
  if (comparison.amounts.size === 0) kinds.push('amounts')
  if (comparison.phrases.length === 0) kinds.push('phrases')
  if (comparison.ibans.length === 0) kinds.push('IBAN')
  return kinds
}

/**
 * HOW A SKIPPED COMPARISON IS SAID OUT LOUD, AND WHY NOT WITH `console.warn`.
 *
 * vitest INTERCEPTS the console: with the default reporter —the one `pnpm test` and
 * therefore `./init.sh` use— a `console.warn` is not printed at all, and neither is the
 * note given to `context.skip`. `writeSync(2, …)` writes to FILE DESCRIPTOR 2: it does
 * not pass through `console`, nor through the reporter, nor through anything vitest
 * owns. It is ONE mechanism chosen and FIXED (feature 23): changing it means measuring
 * again, on purpose — there is a test below that goes red if anyone swaps it while
 * tidying up.
 *
 * The kind only, never a value of his.
 */
function skippedAnnouncement(kinds: ComparedKind[]): string | null {
  if (kinds.length === 0) return null
  const lines = [
    `[no-real-data] THE DATABASE HAS NOTHING TO COMPARE AGAINST FOR: ${kinds.join(', ')}`,
    '[no-real-data]   that comparison was SKIPPED on this run: a datum of that kind copied ' +
      'into the repository is not caught by it.',
    '[no-real-data]   the check of Spanish IBANs by their shape did run: it needs no database.',
  ]
  return `\n${lines.join('\n')}\n\n`
}

function announceSkipped(kinds: ComparedKind[]): void {
  const announcement = skippedAnnouncement(kinds)
  if (announcement) writeSync(2, announcement)
}

let providedComparison: Comparison | null = null

/**
 * What `vitest.global-setup.ts` read from his database, once per file. A run whose
 * global setup provided nothing is a broken wiring, not an empty database: it fails.
 */
function databaseComparison(): Comparison {
  if (providedComparison) return providedComparison
  const reference = inject('realDataReference') as RealDataReference | undefined
  if (!reference) {
    throw new Error(
      'vitest.global-setup.ts provided no `realDataReference`: the comparison against the ' +
        'database cannot run and must not pass in silence.',
    )
  }
  providedComparison = comparisonOf(reference, ownSourceVocabulary())
  return providedComparison
}

describe('no real financial data of the human is versioned', () => {
  it('versions no well-formed Spanish IBAN other than the documented synthetic ones', () => {
    const offenders = scan((line) => {
      const leaked = ibansOf(line).filter(
        (iban) => !allowedIbans.has(iban) && hasValidIbanChecksum(iban),
      )
      if (leaked.length === 0) return null
      // The IBAN itself is NOT echoed here: this message is versioned too.
      return `${leaked.length} IBAN(s) with a valid checksum outside the allow-list of src/no-real-data.test.ts`
    }, false)

    expect(report(offenders)).toEqual([])
  })

  it('has the local captures gitignored, so a capture is never versioned', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8')

    expect(gitignore).toContain('var/drive-read/')
    expect(gitignore).toContain('var/parsed/')
    expect(versionedFiles().filter((file) => file.startsWith('var/'))).toEqual([])
  })

  it('repeats no telling amount of the database', (context) => {
    const { amounts } = databaseComparison()
    if (amounts.size === 0) {
      announceSkipped(['amounts'])
      context.skip('the database has no amount to compare against')
      return
    }

    const offenders = scan(amountLeak(amounts), true)

    expect(report(offenders)).toEqual([])
  })

  it('copies no telling phrase of the database', (context) => {
    // Ours is subtracted from his ONE PHRASE AT A TIME, and only where our own source
    // proves we wrote it (feature 24): the message our parser stores about a row it
    // could not read is not «a phrase of his statement».
    const { phrases } = databaseComparison()
    if (phrases.length === 0) {
      announceSkipped(['phrases'])
      context.skip('the database has no phrase to compare against')
      return
    }

    const offenders = scan(phraseLeak(phrases), true, 2)

    expect(report(offenders)).toEqual([])
  })

  it('repeats no IBAN of the database', (context) => {
    const { ibans } = databaseComparison()
    if (ibans.length === 0) {
      announceSkipped(['IBAN'])
      context.skip('the database has no IBAN to compare against')
      return
    }

    // Neither the path list nor the marker apply: same as the check by shape.
    const offenders = scan(ibanLeak(ibans), false)

    expect(report(offenders)).toEqual([])
  })
})

describe('the guardian itself', () => {
  it('recognizes a real Spanish IBAN and rejects a malformed one', () => {
    expect(hasValidIbanChecksum('ES9121000418450200051332')).toBe(true)
    expect(hasValidIbanChecksum('ES0012345678901234567890')).toBe(false)
    expect(ibansOf('iban ES91 2100 0418 4502 0005 1332 fin')).toEqual(['ES9121000418450200051332'])
  })

  it('reads the same amount however it is written', () => {
    expect(toNumber('9.876,54')).toBe(9876.54)
    expect(toNumber('9876.54')).toBe(9876.54)
    expect(toNumber('-9876,54')).toBe(9876.54)
    expect(toNumber('9 876,54')).toBe(9876.54)
    expect(toNumber('25.000')).toBe(25000)
  })

  it('sees an amount whose thousands separator is a space', () => {
    expect([...amountsOf('saldo 9 876,54 tras el apunte')]).toEqual([9876.54])
  })

  it('only compares amounts telling enough to be nobody else’s', () => {
    expect(isTelling(9876.54)).toBe(true)
    expect(isTelling(43.21)).toBe(true)
    // Round or short figures are indistinguishable from an invented one, and a
    // year is everywhere: comparing them would flood the suite with noise.
    expect(isTelling(4000)).toBe(false)
    expect(isTelling(12.3)).toBe(false)
    expect(isTelling(2026)).toBe(false)
  })

  it('only compares phrases with uncommon words in them', () => {
    // Invented concept: this file is scanned like any other, so nothing real
    // may be written here (see `allowedPaths`).
    expect(tellingPhrases('COMPRA MENSUAL TRAMONTANA GLOBAL')).toContain(
      'compra mensual tramontana',
    )
    expect(tellingPhrases('Valor de mercado')).toEqual([])
  })

  it('is not on its own exception list: it guards itself like any other file', () => {
    expect(isAllowedPath('src/no-real-data.test.ts')).toBe(false)
    expect(isAllowedPath('prisma/migrations/x/migration.sql')).toBe(true)
  })

  it('finds every versioned file through git, not through a hand-kept list', () => {
    const files = versionedFiles()

    expect(files).toContain('docs/conventions.md')
    expect(files).toContain('src/no-real-data.test.ts')
    expect(files.length).toBeGreaterThan(20)
  })

  it('imports nothing that can list or walk a folder', () => {
    // WHAT MAKES «it works the same with `var/` deleted» TRUE: with these two names
    // this file can read a file it is given the path of and write to a descriptor.
    // It cannot list a folder, ask whether a path exists, nor create anything.
    const source = readFileSync(join(repoRoot, 'src/no-real-data.test.ts'), 'utf8')
    const imported = [...source.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'node:fs'/gm)]
      .flatMap((match) => (match[1] ?? '').split(','))
      .map((name) => name.trim())
      .filter(Boolean)
      .sort()

    expect(imported).toEqual(['readFileSync', 'writeSync'])
    // And no other door to the file system: neither the promises API nor a namespace.
    expect(source).not.toMatch(/from\s+'node:fs\/promises'/)
    expect(source).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+'node:fs'/)
    expect(source).not.toMatch(/import\s+\w+\s+from\s+'node:fs'/)
    expect(source).not.toMatch(/require\(/)
  })
})

/**
 * EVERYTHING BELOW IS INVENTED (feature 51). This file is scanned like any other, so
 * the reference is built here in code and in memory — never read from his database —
 * with the SHAPE the reader gives it: decimal text for the amounts, one element per
 * text, and the IBAN compact and in upper case.
 */
const inventedAmount = '7.531,86'
const inventedConcept = 'COMPRA MENSUAL TRAMONTANA'
/** Not Spanish on purpose: the check by shape does not see it, the comparison does. */
const inventedForeignIban = 'NL47ZEPH0318665209'
const inventedForeignIbanAsWritten = 'nl47 zeph 0318 6652 09'

const emptyReference: RealDataReference = { amounts: [], texts: [], ownMessages: [], ibans: [] }
const emptyVocabulary: OwnVocabulary = { phrases: new Set(), words: new Set() }

const inventedReference: RealDataReference = {
  // As PostgreSQL gives a Decimal: a point, and the sign of an expense.
  amounts: ['-7531.86', '1111.11'],
  texts: [inventedConcept, 'Cuenta Ventolera Diaria'],
  ownMessages: [],
  ibans: [inventedForeignIban],
}

describe('the comparison against the database (feature 51)', () => {
  it('catches an amount of the database copied into a versioned file', () => {
    const { amounts } = comparisonOf(inventedReference, emptyVocabulary)

    // A fixture like the one of feature 19: the amount copied, in Spanish notation.
    const fixture: SourceFile = {
      file: 'src/modules/tramontana/tramontana.fixture.ts',
      text: ['export function rows() {', `  return [{ amount: '${inventedAmount}' }]`, '}'].join(
        '\n',
      ),
    }

    const findings = scanSources([fixture], amountLeak(amounts), true)

    expect(report(findings)).toEqual([
      'src/modules/tramontana/tramontana.fixture.ts:2 — ' +
        'an amount on this line is in the database: it is real data, invent another one',
    ])
    // WHERE and WHAT KIND, never the value: this message gets printed and pasted.
    expect(findings[0]?.reason).not.toContain('7.531')
    expect(findings[0]?.reason).not.toContain('7531')
    expect(findings[0]?.reason).not.toContain(inventedAmount)
  })

  it('catches a concept of the database copied into a versioned document', () => {
    const { phrases } = comparisonOf(inventedReference, emptyVocabulary)

    const document: SourceFile = {
      file: 'docs/example.md',
      text: ['# Ejemplo', '', `El movimiento ${inventedConcept} del extracto.`].join('\n'),
    }

    const findings = scanSources([document], phraseLeak(phrases), true, 2)

    // The window joins each line with the next one, so the empty line above it
    // reports the same copy too.
    expect(report(findings)).toEqual([
      'docs/example.md:2 — ' +
        'a three-word sequence copied from the database (a concept of his movements?)',
      'docs/example.md:3 — ' +
        'a three-word sequence copied from the database (a concept of his movements?)',
    ])
    for (const finding of findings) {
      expect(finding.reason).not.toContain('TRAMONTANA')
      expect(finding.reason.toLowerCase()).not.toContain('tramontana')
    }
  })

  it('catches an IBAN of the database copied into a versioned file', () => {
    const { ibans } = comparisonOf(inventedReference, emptyVocabulary)

    // Written as a person writes it: in groups of four and in lower case.
    const document: SourceFile = {
      file: 'progress/reviews/example.md',
      text: ['# Review', `La cuenta ${inventedForeignIbanAsWritten} recibe el traspaso.`].join(
        '\n',
      ),
    }

    const findings = scanSources([document], ibanLeak(ibans), false)

    expect(report(findings)).toEqual([
      'progress/reviews/example.md:2 — ' +
        'an IBAN of the database is on this line: it is real data, invent another one',
    ])
    expect(findings[0]?.reason).not.toContain(inventedForeignIban)
    expect(findings[0]?.reason.toLowerCase()).not.toContain('zeph')
    // The check by shape says nothing about it: it is not a Spanish IBAN.
    expect(ibansOf(inventedForeignIbanAsWritten)).toEqual([])
  })

  it('says nothing about an invented amount, concept or IBAN that is not in the database', () => {
    const { amounts, phrases, ibans } = comparisonOf(inventedReference, emptyVocabulary)

    const invented: SourceFile = {
      file: 'src/modules/tramontana/other.fixture.ts',
      text: [
        "const amount = '2.468,13'",
        "const description = 'RECIBO TRIMESTRAL GARBINADA'",
        "const iban = 'NL52 ZEPH 0741 2290 63'",
      ].join('\n'),
    }

    expect(report(scanSources([invented], amountLeak(amounts), true))).toEqual([])
    expect(report(scanSources([invented], phraseLeak(phrases), true, 2))).toEqual([])
    expect(report(scanSources([invented], ibanLeak(ibans), false))).toEqual([])
    // Not vacuous: there was something of each kind to compare against.
    expect(kindsWithNothingToCompare(comparisonOf(inventedReference, emptyVocabulary))).toEqual([])
  })

  it('compares an amount by its absolute value, and leaves a short or round one out', () => {
    const { amounts } = comparisonOf(
      { ...emptyReference, amounts: ['-7531.86', '10.00', '4000.00', '2026.00', '2.7500'] },
      emptyVocabulary,
    )

    expect([...amounts]).toEqual([7531.86])
  })

  it('compares neither of the two documented synthetic IBANs, even if an account has one', () => {
    const { ibans } = comparisonOf(
      { ...emptyReference, ibans: [...allowedIbans, inventedForeignIban] },
      emptyVocabulary,
    )

    expect(ibans).toEqual([inventedForeignIban])
  })

  it('keeps the path and marker exceptions for amounts and phrases, never for an IBAN', () => {
    const { amounts, phrases, ibans } = comparisonOf(inventedReference, emptyVocabulary)
    const leakingLine = `${inventedAmount} ${inventedConcept} ${inventedForeignIbanAsWritten}`

    const marked: SourceFile = {
      file: 'docs/example.md',
      text: `${leakingLine} <!-- ${skipMarker}: invented collision -->`,
    }
    const migration: SourceFile = {
      file: 'prisma/migrations/20260101000000_example/migration.sql',
      text: `-- ${leakingLine}`,
    }
    const plain: SourceFile = { file: 'docs/plain.md', text: leakingLine }

    // Not vacuous: without the exceptions the same line is caught by the three.
    expect(report(scanSources([plain], amountLeak(amounts), true))).toHaveLength(1)
    expect(report(scanSources([plain], phraseLeak(phrases), true, 2))).toHaveLength(1)
    expect(report(scanSources([plain], ibanLeak(ibans), false))).toHaveLength(1)

    for (const excepted of [marked, migration]) {
      expect(report(scanSources([excepted], amountLeak(amounts), true))).toEqual([])
      expect(report(scanSources([excepted], phraseLeak(phrases), true, 2))).toEqual([])
      // The IBAN is scanned with no exception at all, like the check by shape.
      expect(report(scanSources([excepted], ibanLeak(ibans), false))).toEqual([
        `${excepted.file}:1 — ` +
          'an IBAN of the database is on this line: it is real data, invent another one',
      ])
    }
  })
})

describe('the guardian says out loud what it could not compare (feature 51)', () => {
  it('skips the comparison and says so when the database has nothing to compare against', () => {
    // An empty database, or one without the tables: the reader gives four empty lists.
    const nothing = kindsWithNothingToCompare(comparisonOf(emptyReference, emptyVocabulary))
    expect(nothing).toEqual(['amounts', 'phrases', 'IBAN'])

    const announcement = skippedAnnouncement(nothing)
    expect(announcement).toContain('NOTHING TO COMPARE AGAINST FOR: amounts, phrases, IBAN')
    // It has to say what it means: a line nobody can act on is the note nobody reads.
    expect(announcement).toContain('SKIPPED')
    expect(announcement).toContain('by their shape did run')

    // One kind missing is said by its name, and only that one.
    const onlyIban = kindsWithNothingToCompare(
      comparisonOf({ ...inventedReference, ibans: [] }, emptyVocabulary),
    )
    expect(onlyIban).toEqual(['IBAN'])
    expect(skippedAnnouncement(onlyIban)).toContain('FOR: IBAN\n')

    // Silence when there is data: an announcement on every run about nothing is how a
    // run stops being read.
    expect(kindsWithNothingToCompare(comparisonOf(inventedReference, emptyVocabulary))).toEqual([])
    expect(skippedAnnouncement([])).toBeNull()

    // THE REGRESSION THIS GUARDS, because it already happened once (feature 23, first
    // pass): it was a `console.warn`, vitest INTERCEPTS the console, and with the
    // default reporter — the one `./init.sh` uses — nothing was printed at all.
    // `writeSync(2, …)` is ONE blessed mechanism, fixed on purpose: a rewrite to
    // another one has to be MEASURED again and this line changed on purpose.
    const source = readFileSync(join(repoRoot, 'src/no-real-data.test.ts'), 'utf8')
    // The window is the BODY of the function: from its signature to the first line
    // that is just `}`.
    const start = source.indexOf('function announceSkipped')
    const announce = source.slice(start, source.indexOf('\n}\n', start))

    expect(announce).toContain('writeSync(2,')
    expect(announce).not.toContain('console.')
    expect(announce).not.toContain('process.stderr')
    // And each of the three comparisons announces before it skips.
    const announcedSkips = source.match(
      /announceSkipped\(\['(?:amounts|phrases|IBAN)'\]\)\s+context\.skip\(/g,
    )
    expect(announcedSkips).toHaveLength(3)
  })
})

/**
 * OUR OWN WORDS INSIDE HIS DATA (feature 24). EVERYTHING HERE IS INVENTED: the bank,
 * the amounts and the concept. What is REAL is the SHAPE — a message of ours stored
 * with a value of his inside — and the sentences of the message, which are ours to
 * write and ours to publish.
 */
const inventedBank = 'monte-tramontana'
const inventedProduct = 'PLAZO TRAMONTANA GLOBAL'
const inventedOpening = '5.432,10'
const inventedDeviation = '-1.234,56'
const inventedExpected = '8.642,97'

/** Our parser, in miniature: the source the vocabulary of «our words» is read from. */
const inventedParserSource = [
  // The field NAMES are literals of ours too, exactly as in the real parsers: that is
  // what makes `openedAt: se espera…` provably ours, though the source writes `${key}`.
  "const dateFields = ['date', 'openedAt']",
  'function readIsoField(key: string, value: unknown, problems: string[]) {',
  '  problems.push(`${key}: se espera el formato AAAA-MM-DD, recibido ${display(value)}`)',
  '}',
  'function readTextField(value: unknown, problems: string[]) {',
  '  problems.push(`descripcion: se espera un texto no vacío, recibido ${display(value)}`)',
  '}',
  'function checkBalanceEquation() {',
  '  return (',
  '    `los importes no cuadran: se desvía ${euros(deviation)} € ` +',
  '    `(saldo final esperado ${euros(expected)}, escrito ${euros(balance)}); ` +',
  '    `saldo inicial + entradas - salidas + intereses = saldo final`',
  '  )',
  '}',
  "const ignoredReason = `extensión no soportada por este parser ('${extension}')`",
].join('\n')

const inventedOwnSources: SourceFile[] = [
  { file: `src/modules/${inventedBank}/${inventedBank}.parser.ts`, text: inventedParserSource },
]

/** The message of the 2026-08-20 run, in shape: a date and the balance mismatch. */
const inventedMismatchReason =
  'openedAt: se espera el formato AAAA-MM-DD, recibido "<AAAA-MM-DD>"; ' +
  `los importes no cuadran: se desvía ${inventedDeviation} € ` +
  `(saldo final esperado ${inventedExpected}, escrito 7.408,41); ` +
  'saldo inicial + entradas - salidas + intereses = saldo final; ' +
  `saldo inicial ${inventedOpening}, entradas 2.345,67, salidas 1.098,76, intereses 43,21`

/** The documentation publishing those same sentences, which is what it is for. */
const inventedDocument: SourceFile = {
  file: `docs/${inventedBank}-product-files.md`,
  text: [
    '# Fichero de producto',
    '',
    'Si una fecha no está escrita así, el parser responde',
    '`openedAt: se espera el formato AAAA-MM-DD`.',
    '',
    'El fichero se comprueba a sí mismo:',
    'saldo inicial + entradas - salidas + intereses = saldo final.',
    'Si no cuadra, el motivo dice «los importes no cuadran: se desvía …».',
  ].join('\n'),
}

/** A database whose only content is ONE of our messages, as the reader hands it over. */
function messageReference(reason: string): RealDataReference {
  return { ...emptyReference, ownMessages: [reason] }
}

function phrasesOf(
  reference: RealDataReference,
  own = ownSourceVocabulary(inventedOwnSources),
): string[] {
  return comparisonOf(reference, own).phrases
}

describe('the guardian tells our own words from his data inside a message (feature 24)', () => {
  it('reports NOTHING about a rejection message of ours that the documentation publishes', () => {
    // THE REGRESSION OF 2026-08-20, with invented data: OUR message was stored next to
    // his data, and the docs publish that message word for word. 270 false warnings in
    // one run — and a guardian nobody reads is a guardian that is off.
    const reference = messageReference(inventedMismatchReason)

    expect(
      report(scanSources([inventedDocument], phraseLeak(phrasesOf(reference)), true, 2)),
    ).toEqual([])
  })

  it('would have reported it without the rule, so the test above is not vacuous', () => {
    const reference = messageReference(inventedMismatchReason)

    const naive = report(
      scanSources([inventedDocument], phraseLeak(phrasesOf(reference, emptyVocabulary)), true, 2),
    )

    expect(naive.length).toBeGreaterThan(0)
  })

  it('KEEPS WATCHING the five amounts that live inside that same message', () => {
    // THE HOLE FEATURE 24 REFUSED TO OPEN. Dropping the whole message would have been
    // one line, and it would have stopped watching the amounts it carries inside it.
    // The amounts of a message are compared with no split at all.
    const { amounts } = comparisonOf(
      messageReference(inventedMismatchReason),
      ownSourceVocabulary(inventedOwnSources),
    )

    const copied: SourceFile = {
      file: 'docs/example.md',
      text: `El saldo inicial de ese mes era ${inventedOpening} euros.`,
    }

    expect(report(scanSources([copied], amountLeak(amounts), true))).toEqual([
      'docs/example.md:1 — ' +
        'an amount on this line is in the database: it is real data, invent another one',
    ])
    // The five of the equation, not only the one copied above.
    expect(amounts.has(Number(toNumber(inventedExpected)?.toFixed(4)))).toBe(true)
    expect(amounts.has(Number(toNumber(inventedDeviation)?.toFixed(4)))).toBe(true)
  })

  it('KEEPS WATCHING a value of his echoed inside the message, quoted', () => {
    const reference = messageReference(
      `descripcion: se espera un texto no vacío, recibido "${inventedProduct}"`,
    )

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(reference)), true, 2))).toHaveLength(1)
  })

  it('KEEPS WATCHING a value of his echoed WITHOUT quotes: the second condition', () => {
    // The quotes are a convention of ours, and a convention is not a guarantee. When a
    // parser forgets them, the value lands in the template half — and it stays watched
    // there, because its words are in no message literal of our source.
    const reference = messageReference(
      `descripcion no reconocida: ${inventedProduct} sin más detalle`,
    )

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(reference)), true, 2))).toHaveLength(1)
  })

  it('only lets our messages off: a name of his is compared even if we use those words too', () => {
    // The exclusion is not «this table»: it is the ONE column whose value we compose.
    // A product name arrives among the texts, and it is his however familiar its words
    // look to our own vocabulary.
    const reference: RealDataReference = { ...emptyReference, texts: [inventedProduct] }

    const own = ownSourceVocabulary([
      { file: 'src/x/x.ts', text: "const label = 'plazo tramontana global'" },
    ])
    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(
      report(scanSources([copied], phraseLeak(phrasesOf(reference, own)), true, 2)),
    ).toHaveLength(1)
    // The very same words stored as one of OUR messages are proved ours and let off.
    expect(phrasesOf(messageReference(inventedProduct), own)).toEqual([])
  })

  it('invents no phrase across the seam between two values of the database', () => {
    // Two values glued together would «contain» `monte tramontana monte`, a phrase
    // written in no value of his: every document naming that bank twice would be
    // reported. A phrase of his lives INSIDE one value.
    const reference: RealDataReference = {
      ...emptyReference,
      texts: ['Monte Tramontana', 'Monte Tramontana Ventolera'],
    }

    const phrases = phrasesOf(reference)

    expect(phrases).toEqual(['monte tramontana ventolera'])
    expect(phrases).not.toContain('monte tramontana monte')
    expect(phrases).not.toContain('tramontana monte tramontana')
  })

  it('lifts the echoed value out of the message, and keeps the message whole', () => {
    const message = `descripcion: recibido "${inventedProduct}" y nada más`

    expect(echoedSpans(message)).toEqual([inventedProduct])
    // A message with no echo lifts nothing, and is compared all the same.
    expect(echoedSpans('archivo de cuenta no interpretable')).toEqual([])
  })

  it('KEEPS WATCHING a value of his with an APOSTROPHE inside single quotes', () => {
    // THE SILENCE THE REVIEW OF FEATURE 24 FOUND, and the reason the message is no
    // longer chopped up. `'…'` is the quoting every parser uses except `display()`, and
    // a concept of his can carry an apostrophe — real card concepts do (`L'…`, `D'…`,
    // `O'…`). The cut then fell INSIDE the value, each half landed in a different
    // bucket, neither reached three words, and the concept stopped being compared.
    const concept = "COMPRA D'ALIMENTS VENTOLERA"
    const reference = messageReference(`extensión no soportada por este parser ('${concept}')`)

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${concept} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(reference)), true, 2))).toHaveLength(1)
  })

  it('keeps watching it however the value is quoted, and however long it is', () => {
    // The short one is the nasty case: with a long value both ends still give trigrams
    // and only the phrase across the cut is lost, which is a PARTIAL silence and harder
    // to notice. Both are checked, and so is the double-quoted form that always worked.
    const short = "PAGO O'BRIEN"
    const long = "RECIBO L'ESTANCA VENTOLERA TRAMONTANA MENSUAL"

    for (const [concept, quoted] of [
      [short, `no reconocido ('${short}')`],
      [long, `no reconocido ('${long}')`],
      [long, `no reconocido ("${long}")`],
    ] as Array<[string, string]>) {
      const reference = messageReference(quoted)
      const copied: SourceFile = { file: 'docs/example.md', text: `Su ${concept} de 2026.` }

      expect(
        report(scanSources([copied], phraseLeak(phrasesOf(reference)), true, 2)).length,
      ).toBeGreaterThan(0)
    }
  })

  it('never lets a cut of ours take a character out of the comparison', () => {
    // The invariant that replaces the promise the old comment could not keep: whatever
    // `echoedSpans` decides, the message itself is in the compared bucket, WHOLE.
    const message = "no reconocido ('COMPRA D'ALIMENTS VENTOLERA')"

    const sources = referencePhraseSources(messageReference(message))

    expect(sources.ourProse).toContain(message)
  })

  it('reads our messages from the source: interpolations out, concatenation glued', () => {
    const prose = ownMessageProse(inventedParserSource)

    // What is interpolated is a VALUE, never our words.
    expect(prose.join(' ')).not.toContain('${')
    expect(prose.join(' ')).not.toContain('euros(')
    // A sentence the formatter split across three lines is ONE sentence in the stored message.
    const equation = prose.find((message) => message.includes('cuadran')) ?? ''
    expect(trigramsOf(equation)).toContain('esperado escrito saldo')
  })

  it('takes our vocabulary from production code, never from a test or a fixture', () => {
    // A message is BORN in the parser that composes it. A test or a fixture is where a
    // phrase gets COPIED — and the leak of feature 19 was precisely a fixture.
    expect(isOwnSource('src/modules/import/import.service.ts')).toBe(true)
    expect(isOwnSource('src/modules/import/import.service.test.ts')).toBe(false)
    expect(isOwnSource('src/modules/n26/n26.fixture.ts')).toBe(false)
    expect(isOwnSource('docs/api-contract.md')).toBe(false)
    expect(isOwnSource('src/no-real-data.test.ts')).toBe(false)
  })

  it('proves a phrase is ours by our source, and never by default', () => {
    const own = ownSourceVocabulary(inventedOwnSources)

    expect(isOurOwnPhrase('los importes no', own)).toBe(true)
    // Word by word also counts, because a message is composed AROUND its holes: the
    // source says `${key}: fecha inválida` and the stored message says `openedAt: fecha inválida`.
    expect(isOurOwnPhrase('recibido escrito esperado', own)).toBe(true)
    // One word that is not in our source and the phrase stays watched.
    expect(isOurOwnPhrase('recibido tramontana esperado', own)).toBe(false)
    expect(isOurOwnPhrase('plazo tramontana global', own)).toBe(false)
  })

  it('the real parsers of this repository do feed that vocabulary', () => {
    // Not a tautology: if `isOwnSource` or the literal reader ever stop matching the
    // real tree, the vocabulary empties in silence and the phrase layer floods again.
    const own = ownSourceVocabulary()

    expect(own.phrases.size).toBeGreaterThan(100)
    expect(own.words.has('cuadran')).toBe(true)
  })
})
