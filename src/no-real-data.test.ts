// Privacy guardian (feature 14 `no-real-data`).
//
// It fails when a real financial datum of the owner of this project reaches a
// VERSIONED file. It lives in its own file, and not inside `architecture.test.ts`,
// because it guards the whole repository (docs, specs, progress, prisma…), not the
// shape of `src/`, and because it is the executable half of the rule written in
// `docs/conventions.md` §Tests.
//
// TWO LAYERS, on purpose (see progress/implementations/no-real-data.md):
//
//  1. BY SHAPE — always on, needs nothing from the machine: any well-formed
//     Spanish IBAN (mod-97 checksum) that is not one of the two documented
//     synthetic ones is a leak. This is the layer that protects when an agent
//     works on another machine, with no `var/` at all.
//
//  2. BY COMPARISON against the gitignored captures in `var/` — the precise one,
//     but only available where those captures exist. When they are missing, or
//     when only ONE of the two branches of `var/` is there, the check SKIPS with a
//     message; it never fails and it never asks for them to be versioned (that
//     would be the same problem with another name), and it never compares against
//     half the data in silence.
//
// This file is scanned like every other one: it is NOT on its own exception list.
//
// EXCEPTIONS (all of them explicit and greppable):
//   - `allowedIbans`: an IBAN that is public/invented and used as an example.
//   - `allowedPaths`: a path prefix excluded with its reason.
//   - inline marker `no-real-data-ok`: a line carrying it is skipped by the
//     comparison layers. Use it for the rare false positive, with the reason next
//     to it. It never silences the IBAN layer.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const captureRoot = join(repoRoot, 'var')

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
    .filter((file) => existsSync(join(repoRoot, file)))
}

/**
 * WHAT COUNTS AS A CAPTURE, AND WHY IT IS NOT A LIST OF EXTENSIONS ANY MORE
 * (feature 23 `no-real-data-blind-spot`).
 *
 * Until 2026-08-19 this layer opened `.txt .csv .json .md .tsv` and nothing else. The
 * `.xls` of Openbank is an HTML page in plain text — perfectly readable — so it was
 * NEVER opened, and it is the only bank whose statement carries NAMES OF PEOPLE. That
 * is how the leak of feature 19 (real amounts copied into a fixture) passed with the
 * whole suite in green: the guardian ran «with its comparison layer active» and had
 * not read the file it was supposed to compare against.
 *
 * A list of extensions is a promise about the future that nobody keeps: bank number
 * seven arrives with another one and the hole opens again in silence. So the question
 * asked here is about the CONTENT — are these bytes readable as text? — and nothing
 * else. The name of the file decides nothing.
 */
const binarySampleBytes = 8192
const controlByteRatio = 0.01

/**
 * A capture larger than this is not read: no statement of his is remotely this big
 * (the largest today is ~165 KB), and a runaway file must not hang the suite. It is
 * accounted for exactly like an unreadable one, never ignored in silence.
 */
const maxCaptureBytes = 32 * 1024 * 1024

type CaptureOutcome =
  { readable: true; text: string } | { readable: false; why: 'binary' | 'too-large' }

/**
 * Binary means «there are bytes here that no text has»: a NUL byte, or more than 1% of
 * control bytes in the first 8 KiB. That single question separates the two files of
 * `var/` that really are binary — the `.xlsx` of Bankinter (a ZIP) and the `.pdf` of
 * Trade Republic — from the `.xls` of Openbank, which is only binary in its NAME.
 *
 * Those two are left OUT on purpose, and it is not an oversight:
 *  - reading them as text would feed the comparison compressed bytes, which is noise
 *    that produces false positives and teaches everyone to add exceptions;
 *  - the ZIP is already comparable through its dump in `var/parsed/`, which is why
 *    this file demands BOTH branches of `var/` (see `captureBranches`);
 *  - and the PDF is comparable through NOTHING today, which is not swept under the
 *    rug either: see `unwatchedBanks`.
 */
function looksBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, binarySampleBytes)
  if (sample.length === 0) return false
  let control = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13) control += 1
  }
  return control > sample.length * controlByteRatio
}

/**
 * Decoding a capture NEVER throws: UTF-8 first, and anything else is read as cp1252,
 * which maps all 256 bytes. `decodeCp1252Strict` of `src/lib/` is deliberately NOT
 * reused here — it rejects a file carrying `U+FFFD` (feature 17/22), and a damaged
 * capture is exactly one the guardian still has to compare, not one it may drop.
 */
function decodeCapture(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const captureCache = new Map<string, CaptureOutcome>()

function readCapture(file: string): CaptureOutcome {
  const cached = captureCache.get(file)
  if (cached) return cached
  let outcome: CaptureOutcome
  if (statSync(file).size > maxCaptureBytes) {
    outcome = { readable: false, why: 'too-large' }
  } else {
    const bytes = readFileSync(file)
    outcome = looksBinary(bytes)
      ? { readable: false, why: 'binary' }
      : { readable: true, text: decodeCapture(bytes) }
  }
  captureCache.set(file, outcome)
  return outcome
}

/** Every file under `dir`, readable or not. */
function allFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? allFiles(full) : [full]
  })
}

/** The human's real captures that CAN be read. Gitignored, absent on any other machine. */
function captureFiles(dir = captureRoot): string[] {
  return allFiles(dir).filter((file) => readCapture(file).readable)
}

/**
 * A capture written in markup (the `.xls` of Openbank is an HTML page). Its TAGS are
 * the bank's format — our parser has to reproduce them, so comparing against them would
 * flag our own parser — and its TEXT is his. Same criterion already applied to the KEYS
 * of a `.json` dump below: compare what the document says, never its container.
 */
function looksLikeMarkup(text: string): boolean {
  return text.slice(0, 512).trimStart().startsWith('<') && /<\/?[a-z!?][^>]*>/i.test(text)
}

function markupText(text: string): string {
  return (
    text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // The comment DELIMITERS go and what they say STAYS: the line where he writes his
      // IBAN into the Openbank file is an HTML comment (feature 19).
      .replace(/<!--|-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&[a-z]+;/gi, ' ')
  )
}

/**
 * The two branches of `var/` the comparison layer needs to be worth anything.
 *
 * `var/drive-read/` holds the downloads AS THEY COME, and some are BINARY (the
 * `.xlsx` of Bankinter): nothing readable can be extracted from them here. That
 * whole statement only becomes comparable through its parsed dump in
 * `var/parsed/`. So a machine that has downloaded but not parsed yet used to run
 * the comparison "successfully" against half the data and pass in GREEN with real
 * balances in the tree — false security, which is the one thing this feature
 * exists to prevent. Missing branch ⇒ the layer SKIPS and says so.
 */
const captureBranches = ['drive-read', 'parsed']

function missingCaptureBranches(): string[] {
  return captureBranches.filter((branch) => captureFiles(join(captureRoot, branch)).length === 0)
}

/** Null when the comparison layer can run; the reason to skip when it cannot. */
function comparisonUnavailable(missing = missingCaptureBranches()): string | null {
  if (missing.length === captureBranches.length) {
    return (
      'No captures under var/: the comparison layer cannot run on this machine. This is ' +
      'BY DESIGN — the real data must NEVER be versioned to make this test possible. ' +
      'The shape layer (IBAN checksum) did run.'
    )
  }
  if (missing.length > 0) {
    return (
      `var/ is INCOMPLETE (missing: ${missing.join(', ')}). Comparing against half the ` +
      'captures would pass in green while missing the other half — a binary .xlsx is only ' +
      'readable through its parsed dump. Run the parser, or accept that only the shape ' +
      'layer is guarding this run.'
    )
  }
  return null
}

/**
 * What a capture is worth comparing as: its CONTENT, never its container.
 * Markup is stripped to the text it shows (see `markupText`).
 */
function captureContent(file: string): string {
  const outcome = readCapture(file)
  if (!outcome.readable) return ''
  return looksLikeMarkup(outcome.text) ? markupText(outcome.text) : outcome.text
}

function captureText(dir = captureRoot): string {
  return captureFiles(dir)
    .map((file) => captureContent(file))
    .join('\n')
}

/**
 * OUR OWN WORDS INSIDE HIS DUMP (feature 24, found by the real run of 2026-08-20).
 *
 * `var/parsed/` is not a copy of his statement: it is what OUR parser wrote about it.
 * When a file is rejected, the dump carries the REJECTION MESSAGE of the parser — the
 * balance formula, «se espera el formato AAAA-MM-DD» — and the documentation publishes
 * those same sentences word for word, because they are ours to publish. The guardian
 * read them as «a phrase of his statement copied into the docs» and returned 270 false
 * warnings in one run. It happens to ANY bank every time a file is rejected.
 *
 * WHERE THE LINE IS DRAWN, and why it does not open a hole (the decision of this
 * feature, argued in progress/implementations/guardian-own-words.md):
 *
 *  - It is NOT drawn per FILE: nothing is added to an ignore list.
 *  - It is NOT drawn per FIELD either. Dropping the whole `reason` would stop watching
 *    the five real amounts that the balance-mismatch message carries INSIDE it.
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
 *    the review of this feature). It used to be: the message was cut at the quotes and
 *    only the pieces BETWEEN them were asked about — so a value of his carrying an
 *    APOSTROPHE (`COMPRA D'ALIMENTS…`, and there are apostrophes in real card concepts)
 *    mis-cut the message, each half landed in a different bucket, neither half reached
 *    three words, and the value STOPPED BEING COMPARED. A silence, in the one function
 *    whose comment promised it could not produce one. Now the WHOLE message is asked
 *    about as ONE string and the quoted spans are added ON TOP: the split can only ADD
 *    to what is compared, never take a character away from it.
 *
 *  - AND THE AMOUNT LAYER IS NOT TOUCHED AT ALL: it keeps comparing against the RAW
 *    text of every capture (`captureText`), messages included. The five amounts of the
 *    mismatch reason are watched today exactly as they were yesterday. The line drawn
 *    here is only about WORDS, which is where the confusion was.
 */
const ourProseKeys = new Set(['reason'])

/**
 * OUR OWN FILE-NAMING CONVENTION INSIDE HIS DUMP (feature 34, measured by feature 33
 * on 2026-08-25 and NOT covered by the rule above).
 *
 * The dump of a product parser stores, per entry, the NAME OF THE FILE it parsed. That
 * name is not a datum of his statement: for Trade Republic it is the convention THIS
 * PROJECT PUBLISHES in `docs/trade-republic-product-files.md` and prints on the template
 * he fills in. So the guardian was reporting OUR OWN texts —`docs/api-contract.md`, three
 * test files whose data is synthetic, `history.md`— as «a phrase of his statement»: 52
 * warnings out of ONE trigram, the three words the name leaves once `words()` throws the
 * digits away. It is not a leftover of feature 33: every real parse of Trade Republic he
 * runs writes that name again, so the suite went red whenever he used the application.
 *
 * WHY THE FEATURE 24 MECHANISM DOES NOT COVER IT, and why this is a separate piece:
 * feature 24 subtracts a phrase only when OUR PRODUCTION SOURCE proves we wrote it, and
 * it excludes tests and fixtures ON PURPOSE (a copy is not proof of ownership). The word
 * of this convention lives in the DOCUMENTATION and in the template, never in a message
 * literal of `src/`, so `ownSourceVocabulary` says —correctly— «this is not mine». The
 * proof needed here is of another kind, so it is read from another place, mechanically.
 *
 * WHERE THE LINE IS DRAWN, and why it does not open a hole:
 *
 *  - BY PROVENANCE FIRST: only a value under a key we KNOW holds a file name
 *    (`fileNameKeys`). The very same string sitting in `name`, which is where a product
 *    of his lands, is compared exactly as before.
 *  - AND BY FORM ON TOP: the value has to match, WHOLE and anchored, a naming pattern
 *    that our own documentation publishes. Both, never one — the same shape as the two
 *    conditions of feature 24.
 *  - The patterns are READ FROM OUR DOCS, not written here: there is no hand-kept list to
 *    extend every time it fires, and a run can say WHICH page let a value through.
 *  - A pattern whose placeholder is NOT a date is DISCARDED, because everything a
 *    placeholder admits is HIS. That is what keeps MyInvestor watched: its published
 *    convention is `<producto>-<AAAA-MM-DD>.json`, and `<producto>` is the name he gives
 *    his fund. Only a pattern made of OUR literal words plus a date can exempt anything,
 *    so an exempted value is our published text plus digits, and nothing else can hide
 *    inside it.
 *  - AND THE AMOUNT LAYER IS NOT TOUCHED: it keeps comparing against the RAW text of
 *    every capture, file names included. Digits are its business, not this one's.
 */
const fileNameKeys = new Set(['file'])

interface PublishedFilename {
  /** The pattern as the documentation writes it, placeholder included. */
  source: string
  /** The page it was read from, so it can be said WHY a value was let through. */
  doc: string
  pattern: RegExp
}

/** The pages this project publishes to him: `docs/*.md`, never a test nor a fixture. */
function isPublishedDoc(file: string): boolean {
  return /^docs\/[^/]+\.md$/.test(file)
}

/** The ONE placeholder that admits no word of his: a calendar date. */
const datePlaceholder = '<AAAA-MM-DD>'

/**
 * A published pattern compiled into an anchored regular expression, or `null` when it
 * carries a placeholder that is not a date — that one admits HIS words and may exempt
 * nothing.
 */
function compilePublishedFilename(source: string): RegExp | null {
  if (source.length === 0) return null
  let body = ''
  for (const part of source.split(/(<[^>]*>)/)) {
    if (part.length === 0) continue
    if (!part.startsWith('<')) {
      body += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }
    if (part !== datePlaceholder) return null
    body += '\\d{4}-\\d{2}-\\d{2}'
  }
  return new RegExp(`^${body}$`)
}

/**
 * The naming conventions this project publishes, read from the documentation itself:
 * the line «Convención recomendada …» of each page, with the pattern between backticks.
 */
function publishedFilenames(
  sources: SourceFile[] = versionedSources().filter((source) => isPublishedDoc(source.file)),
): PublishedFilename[] {
  const published: PublishedFilename[] = []
  for (const source of sources) {
    for (const match of source.text.matchAll(/Convención recomendada[^`\n]*`([^`\n]+)`/g)) {
      const text = match[1] ?? ''
      const pattern = compilePublishedFilename(text)
      if (pattern) published.push({ source: text, doc: source.file, pattern })
    }
  }
  return published
}

let publishedFilenamesCache: PublishedFilename[] | null = null

/** Read once per run: the repository does not change while the suite runs. */
function defaultPublishedFilenames(): PublishedFilename[] {
  publishedFilenamesCache ??= publishedFilenames()
  return publishedFilenamesCache
}

/** The published convention a value follows, or `null` when it follows none. */
function publishedFilenameOf(
  value: string,
  published: PublishedFilename[],
): PublishedFilename | null {
  return published.find((entry) => entry.pattern.test(value)) ?? null
}

interface CaptureSources {
  /**
   * His: every capture, minus the template half of our own messages. ONE ENTRY PER
   * VALUE, never a single blob: joining the values of a dump and reading trigrams
   * across the seam invents phrases that are written in NO file — `bank` and `year`
   * repeat once per entry, so a dump of a rejected file used to «contain» the phrase
   * «trade republic trade», and every document naming the bank twice was reported. A
   * phrase of his lives INSIDE one value; the seam between two is our JSON, not his
   * statement. A capture that is not a dump stays one whole entry, as it always was.
   */
  data: string[]
  /**
   * Ours: each of our messages WHOLE, one entry per message. Whole, and not cut at the
   * quotes, because a cut can lose a phrase that straddles it — see `echoedSpans`.
   * Everything here is still compared; it is only asked, phrase by phrase, whether our
   * own source proves we wrote it.
   */
  ourProse: string[]
  /**
   * Neither: the file names let through as OUR OWN published naming convention, with the
   * page that publishes each one (feature 34). Nothing here is compared — it is kept so
   * that «why did the guardian let this through» has an answer that is not a hand-kept
   * list, and so the tests below can assert on exactly what was exempted.
   */
  letThrough: PublishedFileName[]
}

/** A value the guardian let through, and the page whose convention it follows. */
interface PublishedFileName {
  value: string
  doc: string
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
 * The captures split in two: what is his and what is ours.
 *
 * The KEYS of a `.json` dump are dropped as they always were — they are OUR field
 * names (`bookingDate`, `descripcion`…) and comparing prose against them flags every
 * document that talks about the model. Only the values are his… except the ones under
 * `ourProseKeys`, which are the sentences we compose about his file.
 */
function capturePhraseSources(
  dir = captureRoot,
  published: PublishedFilename[] = defaultPublishedFilenames(),
): CaptureSources {
  const data: string[] = []
  const ourProse: string[] = []
  const letThrough: PublishedFileName[] = []
  const exemptionOf = (value: string): PublishedFilename | null =>
    publishedFilenameOf(value, published)
  for (const file of captureFiles(dir)) {
    const outcome = readCapture(file)
    if (!outcome.readable) continue
    if (looksLikeMarkup(outcome.text)) {
      data.push(markupText(outcome.text))
      continue
    }
    if (extname(file).toLowerCase() !== '.json') {
      data.push(outcome.text)
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(outcome.text)
    } catch {
      data.push(outcome.text)
      continue
    }
    const walk = (node: unknown, key: string | null): void => {
      if (typeof node === 'string' && key !== null && ourProseKeys.has(key)) {
        // The message WHOLE on one side, and whatever it quotes lifted to the other.
        // Both, so that no cut of ours can lose a phrase of his.
        data.push(...echoedSpans(node))
        ourProse.push(node)
      } else if (
        typeof node === 'string' &&
        key !== null &&
        fileNameKeys.has(key) &&
        exemptionOf(node)
      ) {
        // A file name that follows, WHOLE, a convention we publish: our words plus a
        // date, and nothing of his can hide inside it (feature 34). It is compared as
        // NEITHER — it is not his data, and it is not one of our messages either, so
        // asking `ownSourceVocabulary` about it would keep it watched: the convention
        // lives in the documentation, not in a message literal of `src/`. What it IS
        // gets recorded, so a run can say what it let through and which page says so.
        // The amount layer never sees this split and keeps reading the raw capture.
        letThrough.push({ value: node, doc: exemptionOf(node)?.doc ?? '' })
      } else if (typeof node === 'string' || typeof node === 'number') {
        data.push(String(node))
      } else if (Array.isArray(node)) {
        node.forEach((item) => walk(item, key))
      } else if (node && typeof node === 'object') {
        for (const [childKey, value] of Object.entries(node)) walk(value, childKey)
      }
    }
    walk(parsed, null)
  }
  return { data, ourProse, letThrough }
}

/**
 * The message literals of one of our source files, as prose.
 *
 * `${…}` goes first: what is interpolated is a VALUE, ours or his, never our words —
 * and dropping it makes the source read like the dump, where `words()` throws digits
 * away too. Then literals glued with `+` are joined back into ONE message, because a
 * sentence split across three lines by the formatter is still one sentence in the dump.
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
 *    interpolations: the source says «${key}: fecha inválida» and the dump says
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

const driveReadRoot = join(captureRoot, 'drive-read')
const parsedRoot = join(captureRoot, 'parsed')

interface BankCoverage {
  bank: string
  files: number
  captured: number
  parsedCaptures: number
}

/**
 * How much of each bank of `var/drive-read/` the comparison layer can actually see.
 * A bank is watched when at least one of its downloads reads as text, OR when its
 * parsed dump exists in `var/parsed/<bank>/` (the only way a real binary becomes
 * comparable, ADR-017).
 */
function bankCoverage(driveRead = driveReadRoot, parsed = parsedRoot): BankCoverage[] {
  if (!existsSync(driveRead)) return []
  return readdirSync(driveRead, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const files = allFiles(join(driveRead, entry.name))
      return {
        bank: entry.name.toLowerCase(),
        files: files.length,
        captured: files.filter((file) => readCapture(file).readable).length,
        parsedCaptures: captureFiles(join(parsed, entry.name.toLowerCase())).length,
      }
    })
}

/**
 * A bank folder that HAS files, where nothing could be captured and no parsed dump
 * exists either. This is the exact state feature 23 was opened for: it is NOT «empty
 * folder» (nothing of his to guard, nothing to say) and it must never end in a silent
 * green — a guardian that passes over what it has not read is worse than none.
 */
function unwatchedNow(coverage = bankCoverage()): string[] {
  return coverage
    .filter((bank) => bank.files > 0 && bank.captured === 0 && bank.parsedCaptures === 0)
    .map((bank) => bank.bank)
    .sort()
}

/**
 * The banks this guardian ADMITS it does not watch, each with its reason and what
 * would close it.
 *
 * It is NOT an exception to make anything pass: nothing here silences a match, and a
 * bank on this list is a hole DECLARED OUT LOUD, printed on every run. The test below
 * asserts the list is EXACTLY the real state, in both directions, so bank number seven
 * arriving with an unreadable format turns the suite RED, and a bank that becomes
 * readable forces its entry to be deleted.
 */
const unwatchedBanks: Array<{ bank: string; reason: string }> = [
  // EMPTY TODAY, and that is a state worth reading, not a leftover. Trade Republic was
  // here until 2026-08-20 because its statement is a PDF drawn with subset fonts; the
  // entry itself said HOW IT CLOSES — «the day that JSON lands in
  // var/drive-read/trade-republic/, that file is text and this entry has to be
  // deleted». It landed, the test went red exactly as it promised, and the entry is
  // gone (feature 24). The list stays, and so does the test below asserting it is
  // EXACTLY the real state: bank number seven arriving with an unreadable format has to
  // turn the suite red and write its reason here.
]

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
 * Three-word sequences of a capture carrying at least TWO uncommon words.
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
  return versionedFiles().map((file) => ({
    file,
    text: readFileSync(join(repoRoot, file), 'utf8'),
  }))
}

/**
 * Runs `check` over every line of every given file. With `window = 2` it runs it over
 * each line JOINED WITH THE NEXT ONE: prose wraps, and a concept split in two lines got
 * past the first sweep of feature 14.
 *
 * It takes the sources instead of reading the repository itself so that the MECHANISM
 * can be proved on a synthetic bank file and a simulated versioned file in a temporary
 * directory — feature 23, and never with a real datum inside a test.
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
 * The two leak checks, built apart from the suite so the same code that guards the
 * repository is the one the mechanism tests exercise.
 *
 * NEITHER MESSAGE CARRIES THE VALUE. It used to echo the amount, and that message is
 * itself printed, pasted into reports and versioned: a guardian that prints his data to
 * complain about his data being printed. Where (file and line) and what kind, nothing
 * else (feature 23).
 */
function amountLeak(secrets: Set<number>): (text: string) => string | null {
  return (text) => {
    for (const match of text.matchAll(numberPattern)) {
      const value = toNumber(match[0])
      if (isTelling(value) && secrets.has(Number(value.toFixed(4)))) {
        return 'an amount on this line is in a file of var/: it is real data, invent another one'
      }
    }
    return null
  }
}

function phraseLeak(phrases: string[]): (text: string) => string | null {
  // The chunk's own trigrams are looked UP in a set, instead of trying every phrase of
  // `var/` on every line. Same verdict for a real copy —a phrase is three consecutive
  // words either way— and the cost stops depending on how much of `var/` is captured:
  // with the two `.xls` of Openbank entering (feature 23) the old loop went over the
  // 5 s budget of the suite. It is also STRICTER: `includes` matched a phrase glued to
  // the tail of a longer word.
  const wanted = new Set(phrases)
  return (text) =>
    trigramsOf(text).some((trigram) => wanted.has(trigram))
      ? 'a three-word sequence copied from a file of var/ (a concept of his statement?)'
      : null
}

function report(findings: Finding[]): string[] {
  return findings.map((finding) => `${finding.file}:${finding.line} — ${finding.reason}`).sort()
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

  it('repeats no telling amount of the local captures (skipped when they are absent or partial)', (context) => {
    const unavailable = comparisonUnavailable()
    if (unavailable) {
      context.skip(unavailable)
      return
    }

    const secrets = amountsOf(captureText())
    expect(secrets.size).toBeGreaterThan(0)

    const offenders = scan(amountLeak(secrets), true)

    expect(report(offenders)).toEqual([])
  })

  it('copies no telling phrase of the local captures (skipped when they are absent or partial)', (context) => {
    const unavailable = comparisonUnavailable()
    if (unavailable) {
      context.skip(unavailable)
      return
    }

    // Ours is subtracted from his ONE PHRASE AT A TIME, and only where our own source
    // proves we wrote it (feature 24): the rejection message our parser leaves inside
    // the dump is not «a phrase of his statement».
    const phrases = comparablePhrases(capturePhraseSources(), ownSourceVocabulary())
    expect(phrases.length).toBeGreaterThan(0)

    const offenders = scan(phraseLeak(phrases), true, 2)

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

  it('refuses to compare against half of var/ instead of passing in green', () => {
    // A binary `.xlsx` of `drive-read/` is only readable through its dump in
    // `parsed/`: with one branch missing the comparison would guard half the data
    // and say nothing. It has to skip WITH A REASON, and name the branch.
    expect(comparisonUnavailable([])).toBeNull()
    expect(comparisonUnavailable(['parsed'])).toContain('INCOMPLETE')
    expect(comparisonUnavailable(['parsed'])).toContain('parsed')
    expect(comparisonUnavailable(['drive-read', 'parsed'])).toContain('BY DESIGN')
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
})

/**
 * EVERYTHING BELOW IS INVENTED (feature 23). This file is scanned like any other, so a
 * synthetic bank file is built here in code — never a copy of his — and it lives in a
 * temporary directory outside the repository that is deleted when the suite ends.
 *
 * The invented statement has the SHAPE of the Openbank download: an HTML page named
 * `.xls`, with the IBAN line he writes inside an HTML comment, Spanish thousands and
 * decimal separators, and a concept of three words.
 */
const inventedIban = 'ES9820385778983000760236'
const inventedAmount = '7.531,86'
const inventedConcept = 'COMPRA MENSUAL TRAMONTANA'
const inventedStatementXls = [
  '<!DOCTYPE html>',
  `<!-- iban;${inventedIban} -->`,
  '<html><head><meta charset="iso-8859-1"><style>td { color: #123456 }</style></head>',
  '<body><table>',
  `<tr><td class="cell">01/02/2026</td><td class="cell">${inventedConcept}</td>`,
  `<td class="cell">-${inventedAmount}</td><td class="cell">1.111,11&nbsp;&euro;</td></tr>`,
  '</table></body></html>',
].join('\n')

/** A real binary: the first bytes of a ZIP, which is what an `.xlsx` is. */
const inventedZipBytes = Buffer.from([
  0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x02, 0x00, 0x03, 0x1f, 0x8b,
])

const temporaryRoots: string[] = []

function temporaryCaptureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'no-real-data-'))
  temporaryRoots.push(root)
  return root
}

function writeCapture(root: string, relative: string, content: string | Buffer): string {
  const full = join(root, ...relative.split('/'))
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
})

describe('the capture layer looks at the CONTENT, not at the extension (feature 23)', () => {
  it('tells a real binary from text by its bytes, whatever the file is called', () => {
    // The `.xls` of Openbank is HTML: binary in its NAME only. The `.xlsx` is a ZIP.
    expect(looksBinary(Buffer.from(inventedStatementXls, 'latin1'))).toBe(false)
    expect(looksBinary(inventedZipBytes)).toBe(true)
    // A PDF: `%PDF` in ASCII and NUL bytes right after.
    expect(looksBinary(Buffer.concat([Buffer.from('%PDF-2.0'), Buffer.from([0, 1, 2])]))).toBe(true)
    expect(looksBinary(Buffer.from('fecha;concepto;importe\n', 'utf8'))).toBe(false)
    expect(looksBinary(Buffer.alloc(0))).toBe(false)
  })

  it('captures a statement named .xls and leaves the binary of the same folder out', () => {
    const root = temporaryCaptureRoot()
    const statement = writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)
    writeCapture(root, 'drive-read/tramontana/2026/e.xlsx', inventedZipBytes)

    expect(captureFiles(join(root, 'drive-read'))).toEqual([statement])
    expect(readCapture(statement).readable).toBe(true)
  })

  it('compares what a markup capture SAYS, not the tags of the bank format', () => {
    const root = temporaryCaptureRoot()
    const statement = writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)
    const content = captureContent(statement)

    expect(looksLikeMarkup(inventedStatementXls)).toBe(true)
    // The tags are the bank's format, which our own parser has to reproduce.
    expect(content).not.toContain('<td')
    expect(content).not.toContain('class="cell"')
    // What the document shows is his, and it is compared.
    expect(content).toContain(inventedConcept)
    expect(content).toContain(inventedAmount)
    // And the IBAN line he writes lives inside an HTML COMMENT: it must survive.
    expect(content).toContain(inventedIban)
  })

  it('reads the real .xls of Openbank, the file that was never opened until today', (context) => {
    const openbank = join(driveReadRoot, 'openbank')
    if (!existsSync(openbank)) {
      context.skip('no var/drive-read/openbank/ on this machine (it is gitignored, by design)')
      return
    }

    const files = allFiles(openbank)
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter((file) => readCapture(file).readable)).toEqual(files)
  })
})

/**
 * HOW THE DECLARED HOLE IS SAID OUT LOUD, AND WHY NOT WITH `console.warn`.
 *
 * It WAS a `console.warn`, and that was a bug caught in review: vitest INTERCEPTS the
 * console, so with the default reporter —the one `pnpm test` and therefore `./init.sh`
 * use— nothing was printed at all. The suite ended green and silent over an unwatched
 * bank, which is the exact thing feature 23 exists to stop; the declaration had become
 * the note nobody reads, same as the note that caused all this.
 *
 * `writeSync(2, …)` writes to FILE DESCRIPTOR 2: it does not pass through `console`, nor
 * through the reporter, nor through anything vitest owns, so no reporter, pool or config
 * change can take it away. MEASURED, and said without inflating it: `process.stderr.write`
 * comes out too today. This is not «the only thing that works», it is ONE mechanism
 * chosen and FIXED, because what has to survive a year is a guarantee and not a
 * preference. Changing it means measuring again, on purpose — there is a test below that
 * goes red if anyone swaps it while tidying up.
 *
 * Folder names only, never a value of his.
 */
function unwatchedAnnouncement(unwatched: string[]): string | null {
  if (unwatched.length === 0) return null
  const lines = [
    `[no-real-data] THE COMPARISON LAYER DOES NOT WATCH: ${unwatched.join(', ')}`,
    '[no-real-data]   a value copied from that bank into the repository is caught by ' +
      'NOTHING: it has to be checked by hand.',
    '[no-real-data]   why, and how each one closes: `unwatchedBanks` in ' +
      'src/no-real-data.test.ts',
  ]
  return `\n${lines.join('\n')}\n\n`
}

function announceUnwatched(unwatched: string[]): void {
  const announcement = unwatchedAnnouncement(unwatched)
  if (announcement) writeSync(2, announcement)
}

describe('the guardian says out loud what it cannot watch (feature 23)', () => {
  it('tells a bank folder it cannot read apart from an empty one', () => {
    const root = temporaryCaptureRoot()
    const driveRead = join(root, 'drive-read')
    const parsed = join(root, 'parsed')
    mkdirSync(join(driveRead, 'vacio'), { recursive: true })
    writeCapture(root, 'drive-read/opaco/2026/e.xlsx', inventedZipBytes)
    writeCapture(root, 'drive-read/volcado/2026/e.xlsx', inventedZipBytes)
    writeCapture(root, 'parsed/volcado/2026/e.xlsx.json', `{"importe":"${inventedAmount}"}`)

    const coverage = bankCoverage(driveRead, parsed)

    expect(coverage.find((bank) => bank.bank === 'vacio')).toEqual({
      bank: 'vacio',
      files: 0,
      captured: 0,
      parsedCaptures: 0,
    })
    // An EMPTY folder has nothing of his to guard: it is not a hole.
    // A folder with files where nothing could be read and there is no dump IS one.
    // A binary with its dump in `parsed/` is watched through the dump (ADR-017).
    expect(unwatchedNow(coverage)).toEqual(['opaco'])
  })

  it('announces the hole with the names of the folders and nothing else', () => {
    const announcement = unwatchedAnnouncement(['opaco', 'otro'])

    expect(announcement).toContain('DOES NOT WATCH: opaco, otro')
    // It has to say what it means, not just name a folder: a line nobody can act on
    // is the note nobody reads, which is what this feature exists to stop.
    expect(announcement).toContain('checked by hand')
    expect(announcement).toContain('unwatchedBanks')
    // Silence when there is nothing to say: an announcement on every run about
    // nothing is how a run stops being read.
    expect(unwatchedAnnouncement([])).toBeNull()
  })

  it('writes that announcement to the file descriptor, NOT through the console', () => {
    // THE REGRESSION THIS GUARDS, because it already happened once (feature 23, first
    // pass): it was a `console.warn`, vitest INTERCEPTS the console, and with the
    // default reporter — the one `./init.sh` uses — nothing was printed at all. The
    // suite ended green and silent over an unwatched bank.
    //
    // WHY THE ASSERTION IS THIS STRICT, said straight: `process.stderr.write` DOES come
    // out too (measured by the reviewer: 3 lines with `pnpm test`). This is not «the
    // other one does not work» — it is ONE blessed mechanism, fixed on purpose, because
    // what has to survive a year is not a preference but a guarantee: `writeSync(2, …)`
    // goes to the file descriptor without passing through anything vitest owns, so no
    // reporter, pool or config can take it away. A rewrite to another mechanism has to
    // be MEASURED again and this line changed on purpose, never «tidied up» in passing.
    const source = readFileSync(join(repoRoot, 'src/no-real-data.test.ts'), 'utf8')
    // The window is the BODY of the function, not a number of characters: it starts at
    // its signature and ends at the first line that is just `}`. A magic length breaks
    // the day somebody adds a comment inside, which is a red that means nothing.
    const start = source.indexOf('function announceUnwatched')
    const announce = source.slice(start, source.indexOf('\n}\n', start))

    expect(announce).toContain('writeSync(2,')
    expect(announce).not.toContain('console.')
    expect(announce).not.toContain('process.stderr')
  })

  it('holds the inventory of unwatched banks EXACTLY, so bank number seven turns it red', (context) => {
    if (!existsSync(driveReadRoot)) {
      context.skip('no var/drive-read/ on this machine (it is gitignored, by design)')
      return
    }

    const unwatched = unwatchedNow()
    announceUnwatched(unwatched)

    // Both directions on purpose: a new unreadable bank fails here, and a bank that
    // became readable fails until its entry is deleted.
    expect(unwatched).toEqual(unwatchedBanks.map((entry) => entry.bank).sort())
    expect(unwatchedBanks.every((entry) => entry.reason.length > 80)).toBe(true)
  })
})

describe('the mechanism that missed the leak of feature 19 (feature 23)', () => {
  it('catches an amount of a bank file copied into a versioned file', () => {
    const root = temporaryCaptureRoot()
    writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)
    const secrets = amountsOf(captureText(root))

    // A fixture like the one of feature 19: the amount copied from the statement.
    const fixture: SourceFile = {
      file: 'src/modules/tramontana/tramontana.fixture.ts',
      text: ['export function rows() {', `  return [{ amount: '${inventedAmount}' }]`, '}'].join(
        '\n',
      ),
    }

    const findings = scanSources([fixture], amountLeak(secrets), true)

    expect(report(findings)).toEqual([
      'src/modules/tramontana/tramontana.fixture.ts:2 — ' +
        'an amount on this line is in a file of var/: it is real data, invent another one',
    ])
    // WHERE and WHAT KIND, never the value: this message gets printed and pasted.
    expect(findings[0]?.reason).not.toContain('7.531')
    expect(findings[0]?.reason).not.toContain(inventedAmount)
  })

  it('says nothing about an amount that is not in the bank file', () => {
    const root = temporaryCaptureRoot()
    writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)
    const secrets = amountsOf(captureText(root))

    const invented: SourceFile = {
      file: 'src/modules/tramontana/other.fixture.ts',
      text: "const amount = '2.468,13'\n",
    }

    expect(report(scanSources([invented], amountLeak(secrets), true))).toEqual([])
  })

  it('catches a concept of a bank file copied into a versioned document', () => {
    const root = temporaryCaptureRoot()
    writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)
    const phrases = comparablePhrases(capturePhraseSources(root), ownSourceVocabulary())

    const document: SourceFile = {
      file: 'docs/example.md',
      text: `El movimiento ${inventedConcept} del extracto.`,
    }

    expect(report(scanSources([document], phraseLeak(phrases), true, 2))).toEqual([
      'docs/example.md:1 — ' +
        'a three-word sequence copied from a file of var/ (a concept of his statement?)',
    ])
    expect(
      report(
        scanSources(
          [{ file: 'docs/other.md', text: 'Valor de mercado' }],
          phraseLeak(phrases),
          true,
          2,
        ),
      ),
    ).toEqual([])
  })

  it('would have caught it through the .xls, which the old extension list never opened', () => {
    // The regression in one line: the file is named `.xls`, and `.xls` was not on the
    // list of extensions that decided the capture until 2026-08-19.
    const root = temporaryCaptureRoot()
    writeCapture(root, 'drive-read/tramontana/2026/e.xls', inventedStatementXls)

    expect(captureFiles(root)).toHaveLength(1)
    expect(amountsOf(captureText(root)).size).toBeGreaterThan(0)
  })
})

/**
 * OUR OWN WORDS INSIDE HIS DUMP (feature 24). EVERYTHING HERE IS INVENTED: the bank,
 * the file, the amounts and the concept. What is REAL is the SHAPE — a dump of ours
 * that carries a rejection message of ours — and the sentences of the message, which
 * are ours to write and ours to publish.
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

function inventedRejectionDump(reason: string): string {
  return JSON.stringify({
    bank: inventedBank,
    year: '2026',
    products: [],
    failed: [{ bank: inventedBank, year: '2026', file: 'cuenta.json', reason }],
    ignored: [
      {
        bank: inventedBank,
        year: '2026',
        file: 'extracto.pdf',
        reason: "extensión no soportada por este parser ('.pdf')",
      },
    ],
  })
}

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

const emptyVocabulary: OwnVocabulary = { phrases: new Set(), words: new Set() }

function dumpRoot(reason: string): string {
  const root = temporaryCaptureRoot()
  writeCapture(root, `drive-read/${inventedBank}/2026/cuenta.json`, '{"saldo": 7408.41}')
  writeCapture(root, `parsed/${inventedBank}/2026/products.json`, inventedRejectionDump(reason))
  return root
}

function phrasesOf(root: string, own = ownSourceVocabulary(inventedOwnSources)): string[] {
  return comparablePhrases(capturePhraseSources(root), own)
}

describe('the guardian tells our own words from his data inside the dump (feature 24)', () => {
  it('reports NOTHING about a rejection message of ours that the documentation publishes', () => {
    // THE REGRESSION OF 2026-08-20, with invented data: his file was rejected, the dump
    // kept OUR message, and the docs publish that message word for word. 270 false
    // warnings in one run — and a guardian nobody reads is a guardian that is off.
    const root = dumpRoot(inventedMismatchReason)

    expect(report(scanSources([inventedDocument], phraseLeak(phrasesOf(root)), true, 2))).toEqual(
      [],
    )
  })

  it('would have reported it without the rule, so the test above is not vacuous', () => {
    const root = dumpRoot(inventedMismatchReason)

    const naive = report(
      scanSources([inventedDocument], phraseLeak(phrasesOf(root, emptyVocabulary)), true, 2),
    )

    expect(naive.length).toBeGreaterThan(0)
  })

  it('KEEPS WATCHING the five amounts that live inside that same message', () => {
    // THE HOLE THIS FEATURE REFUSED TO OPEN. Dropping the whole `reason` would have
    // been one line, and it would have stopped watching the five real amounts the
    // mismatch message carries inside it. The amount layer never sees this split: it
    // compares against the RAW text of the capture, message included.
    const root = dumpRoot(inventedMismatchReason)
    const secrets = amountsOf(captureText(root))

    const copied: SourceFile = {
      file: 'docs/example.md',
      text: `El saldo inicial de ese mes era ${inventedOpening} euros.`,
    }

    expect(report(scanSources([copied], amountLeak(secrets), true))).toEqual([
      'docs/example.md:1 — ' +
        'an amount on this line is in a file of var/: it is real data, invent another one',
    ])
    // The five of the equation, not only the one copied above.
    expect(secrets.has(Number(toNumber(inventedExpected)?.toFixed(4)))).toBe(true)
    expect(secrets.has(Number(toNumber(inventedDeviation)?.toFixed(4)))).toBe(true)
  })

  it('KEEPS WATCHING a value of his echoed inside the message, quoted', () => {
    const root = dumpRoot(`descripcion: se espera un texto no vacío, recibido "${inventedProduct}"`)

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(root)), true, 2))).toHaveLength(1)
  })

  it('KEEPS WATCHING a value of his echoed WITHOUT quotes: the second condition', () => {
    // The quotes are a convention of ours, and a convention is not a guarantee. When a
    // parser forgets them, the value lands in the template half — and it stays watched
    // there, because its words are in no message literal of our source.
    const root = dumpRoot(`descripcion no reconocida: ${inventedProduct} sin más detalle`)

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(root)), true, 2))).toHaveLength(1)
  })

  it('only lets `reason` off: a name of his is compared even if we use those words too', () => {
    // The exclusion is not «this file» nor «this dump»: it is the ONE key whose value
    // we compose. A product name lands in `name`, and it is his however familiar its
    // words look to our own vocabulary.
    const root = temporaryCaptureRoot()
    writeCapture(root, `drive-read/${inventedBank}/2026/cuenta.json`, '{"saldo": 7408.41}')
    writeCapture(
      root,
      `parsed/${inventedBank}/2026/products.json`,
      JSON.stringify({ bank: inventedBank, year: '2026', products: [{ name: inventedProduct }] }),
    )

    const own = ownSourceVocabulary([
      { file: 'src/x/x.ts', text: "const label = 'plazo tramontana global'" },
    ])
    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedProduct} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(root, own)), true, 2))).toHaveLength(1)
  })

  it('invents no phrase across the seam between two values of the dump', () => {
    // `bank` repeats once per entry, so the joined values of a dump «contained»
    // `monte tramontana monte`, a phrase written in no file of his. That is what
    // flagged every document naming the bank twice.
    const root = dumpRoot(inventedMismatchReason)

    const phrases = phrasesOf(root)

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
    // THE SILENCE THE REVIEW OF THIS FEATURE FOUND, and the reason the message is no
    // longer chopped up. `'…'` is the quoting every parser uses except `display()`, and
    // a concept of his can carry an apostrophe — real card concepts do (`L'…`, `D'…`,
    // `O'…`). The cut then fell INSIDE the value, each half landed in a different
    // bucket, neither reached three words, and the concept stopped being compared: a
    // REGRESSION, because before this feature the whole message was compared as one.
    const concept = "COMPRA D'ALIMENTS VENTOLERA"
    const root = dumpRoot(`extensión no soportada por este parser ('${concept}')`)

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${concept} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(phrasesOf(root)), true, 2))).toHaveLength(1)
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
      const root = dumpRoot(quoted)
      const copied: SourceFile = { file: 'docs/example.md', text: `Su ${concept} de 2026.` }

      expect(
        report(scanSources([copied], phraseLeak(phrasesOf(root)), true, 2)).length,
      ).toBeGreaterThan(0)
    }
  })

  it('never lets a cut of ours take a character out of the comparison', () => {
    // The invariant that replaces the promise the old comment could not keep: whatever
    // `echoedSpans` decides, the message itself is in the compared bucket, WHOLE.
    const message = "no reconocido ('COMPRA D'ALIMENTS VENTOLERA')"
    const root = dumpRoot(message)

    const sources = capturePhraseSources(root)

    expect(sources.ourProse).toContain(message)
  })

  it('reads our messages from the source: interpolations out, concatenation glued', () => {
    const prose = ownMessageProse(inventedParserSource)

    // What is interpolated is a VALUE, never our words.
    expect(prose.join(' ')).not.toContain('${')
    expect(prose.join(' ')).not.toContain('euros(')
    // A sentence the formatter split across three lines is ONE sentence in the dump.
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
    // source says `${key}: fecha inválida` and the dump says `openedAt: fecha inválida`.
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

/**
 * OUR OWN NAMING CONVENTION INSIDE HIS DUMP (feature 34). EVERYTHING HERE IS INVENTED:
 * the bank, the page, the convention it publishes, the product and the file names. What
 * is REAL is the SHAPE — a dump of ours carrying the NAME of the file it parsed, and a
 * page of ours publishing how that file is to be named.
 */
const inventedConventionDoc: SourceFile = {
  file: 'docs/monte-tramontana-product-files.md',
  text: [
    '# Ficheros de producto de Monte Tramontana',
    '',
    '**El nombre del archivo no se valida nunca**: la cuenta y la fecha salen de dentro.',
    '',
    '**Convención recomendada (no obligatoria):** `cuenta-ventolera-<AAAA-MM-DD>.json`.',
  ].join('\n'),
}

/** A page that publishes a pattern with a hole HIS words fall into: it exempts nothing. */
const inventedOpenConventionDoc: SourceFile = {
  file: 'docs/otro-banco-product-files.md',
  text: '**Convención recomendada (no obligatoria):** `<producto>-<AAAA-MM-DD>.json`, p. ej.',
}

const inventedOwnName = 'cuenta-ventolera-2026-08-31.json'
/** A name of HIS: the product he keeps calling like that, written into the file name. */
const inventedHisName = 'renta-ventolera-tramontana-2026-08-31.json'

function fileNameDump(name: string, key = 'file'): string {
  return JSON.stringify({
    bank: inventedBank,
    year: '2026',
    products: [{ [key]: name, type: 'savings-account' }],
  })
}

/** A dump whose only interesting value is the NAME of the file it parsed. */
function fileNameRoot(name: string, key = 'file'): string {
  const root = temporaryCaptureRoot()
  writeCapture(root, `drive-read/${inventedBank}/2026/${name}`, '{"saldo": 7408.41}')
  writeCapture(root, `parsed/${inventedBank}/2026/products.json`, fileNameDump(name, key))
  return root
}

function fileNamePhrases(
  root: string,
  published: PublishedFilename[] = publishedFilenames([inventedConventionDoc]),
): string[] {
  return comparablePhrases(
    capturePhraseSources(root, published),
    ownSourceVocabulary(inventedOwnSources),
  )
}

describe('the guardian knows our own published file names (feature 34)', () => {
  it('reads the conventions from our own docs, never from a list written by hand', () => {
    const published = publishedFilenames([inventedConventionDoc])

    expect(published).toHaveLength(1)
    expect(published[0]?.doc).toBe(inventedConventionDoc.file)
    // The pattern matches WHOLE and anchored: our literal words plus a date, no more.
    expect(published[0]?.pattern.test(inventedOwnName)).toBe(true)
    expect(published[0]?.pattern.test(`x-${inventedOwnName}`)).toBe(false)
    expect(published[0]?.pattern.test('cuenta-ventolera.json')).toBe(false)
    expect(published[0]?.pattern.test(inventedHisName)).toBe(false)
  })

  it('DISCARDS a published pattern whose placeholder is not a date', () => {
    // `<producto>` is the name HE gives his fund: a pattern with that hole in it would
    // exempt any word of his. Only a date is admitted, because a date carries none.
    expect(compilePublishedFilename('<producto>-<AAAA-MM-DD>.json')).toBeNull()
    expect(publishedFilenames([inventedOpenConventionDoc])).toEqual([])
    expect(compilePublishedFilename('cuenta-ventolera-<AAAA-MM-DD>.json')).not.toBeNull()
  })

  it('the real docs of this repository do feed it, and none of them opens a hole', () => {
    // Not a tautology, and the same guard feature 24 put on its vocabulary: if the line
    // of the docs ever changes shape, this empties in silence and the false positive is
    // back on every real parse. The patterns are NOT written here: each example is built
    // from the page itself, so no name of the convention is copied into this file.
    const published = publishedFilenames()

    expect(published.length).toBeGreaterThan(0)
    for (const entry of published) {
      expect(entry.pattern.test(entry.source.replace(datePlaceholder, '2026-08-31'))).toBe(true)
      // DECISION 4, checked and not assumed: no real published pattern accepts a name
      // that carries a product of his. The one that could (`<producto>-…`, MyInvestor)
      // is discarded above, so its dump stays watched exactly as before.
      expect(entry.pattern.test(inventedHisName)).toBe(false)
      expect(entry.pattern.test('plazo-tramontana-global-2026-08-31.json')).toBe(false)
    }
  })

  it('reports NOTHING about a file name our own documentation publishes', () => {
    // THE REGRESSION MEASURED ON 2026-08-25, with invented data: the dump keeps the NAME
    // of the file, the name is the convention we publish, and our own texts repeat it.
    // 52 warnings out of one trigram — and a guardian nobody reads is a guardian that is
    // off. It is not a leftover: every real parse of his writes that name again.
    const root = fileNameRoot(inventedOwnName)

    const ourText: SourceFile = {
      file: 'docs/api-contract.md',
      text: `Un archivo llamado ${inventedOwnName} entra como producto.`,
    }

    expect(report(scanSources([ourText], phraseLeak(fileNamePhrases(root)), true, 2))).toEqual([])
  })

  it('would have reported it without the rule, so the test above is not vacuous', () => {
    const root = fileNameRoot(inventedOwnName)

    const ourText: SourceFile = {
      file: 'docs/api-contract.md',
      text: `Un archivo llamado ${inventedOwnName} entra como producto.`,
    }

    const naive = report(scanSources([ourText], phraseLeak(fileNamePhrases(root, [])), true, 2))

    expect(naive.length).toBeGreaterThan(0)
  })

  it('KEEPS CATCHING a real datum of his inside a file name, with file and line', () => {
    // THE CENTRAL TEST OF THIS FEATURE: a name that is NOT our convention is his, and it
    // is compared exactly as before. Without this the change would be indistinguishable
    // from switching the alarm off.
    const root = fileNameRoot(inventedHisName)

    const leak: SourceFile = {
      file: 'docs/example.md',
      text: 'El movimiento RENTA VENTOLERA TRAMONTANA del extracto.',
    }
    const findings = report(scanSources([leak], phraseLeak(fileNamePhrases(root)), true, 2))

    expect(findings).toEqual([
      'docs/example.md:1 — ' +
        'a three-word sequence copied from a file of var/ (a concept of his statement?)',
    ])
    // WHERE and WHAT KIND, never the value (ADR-017).
    expect(findings[0]).not.toContain('VENTOLERA')
  })

  it('KEEPS CATCHING the very same name under a key that is not a file name', () => {
    // The provenance half of the rule: `name` is where a product of his lands, and the
    // exemption does not reach it however our own the words look.
    const root = fileNameRoot(inventedOwnName, 'name')

    const copied: SourceFile = { file: 'docs/example.md', text: `Su ${inventedOwnName} de 2026.` }

    expect(report(scanSources([copied], phraseLeak(fileNamePhrases(root)), true, 2))).toHaveLength(
      1,
    )
  })

  it('KEEPS CATCHING his amounts: the amount layer never sees this split', () => {
    const root = fileNameRoot(inventedOwnName)
    const secrets = amountsOf(captureText(root))

    const copied: SourceFile = { file: 'docs/example.md', text: 'El saldo era 7.408,41 euros.' }

    expect(report(scanSources([copied], amountLeak(secrets), true))).toEqual([
      'docs/example.md:1 — ' +
        'an amount on this line is in a file of var/: it is real data, invent another one',
    ])
    // The raw capture is what that layer reads, file names included.
    expect(captureText(root)).toContain(inventedOwnName)
  })

  it('says WHAT it let through and WHICH page says so: no silent exception', () => {
    const published = publishedFilenames([inventedConventionDoc])

    const { letThrough } = capturePhraseSources(fileNameRoot(inventedOwnName), published)

    expect(letThrough).toEqual([{ value: inventedOwnName, doc: inventedConventionDoc.file }])
    // And nothing is let through when the name is his.
    expect(capturePhraseSources(fileNameRoot(inventedHisName), published).letThrough).toEqual([])
  })
})
