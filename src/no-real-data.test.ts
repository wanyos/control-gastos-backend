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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
const captureExtensions = new Set(['.txt', '.csv', '.json', '.md', '.tsv'])
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

/** The human's real captures. Gitignored, and absent on any other machine. */
function captureFiles(dir = captureRoot): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return captureFiles(full)
    return captureExtensions.has(extname(entry.name).toLowerCase()) ? [full] : []
  })
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

function captureText(): string {
  return captureFiles()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

/**
 * The same captures, but with the KEYS of a `.json` dump dropped: those keys are
 * OUR field names (`bookingDate`, `descripcion`…) and comparing prose against them
 * flags every document that talks about the model. Only the values are his.
 */
function captureValuesText(): string {
  return captureFiles()
    .map((file) => {
      const raw = readFileSync(file, 'utf8')
      if (extname(file).toLowerCase() !== '.json') return raw
      try {
        const values: string[] = []
        const walk = (node: unknown): void => {
          if (typeof node === 'string' || typeof node === 'number') values.push(String(node))
          else if (Array.isArray(node)) node.forEach(walk)
          else if (node && typeof node === 'object') Object.values(node).forEach(walk)
        }
        walk(JSON.parse(raw))
        return values.join('\n')
      } catch {
        return raw
      }
    })
    .join('\n')
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

/**
 * Runs `check` over every line of every versioned file. With `window = 2` it runs
 * it over each line JOINED WITH THE NEXT ONE: prose wraps, and a concept split in
 * two lines got past the first sweep of feature 14.
 */
function scan(
  check: (text: string) => string | null,
  skipAllowedPaths: boolean,
  window = 1,
): Finding[] {
  const findings: Finding[] = []
  for (const file of versionedFiles()) {
    if (skipAllowedPaths && isAllowedPath(file)) continue
    const lines = readFileSync(join(repoRoot, file), 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      const chunk = lines.slice(index, index + window)
      if (skipAllowedPaths && chunk.some((text) => text.includes(skipMarker))) return
      const reason = check(chunk.join(' '))
      if (reason) findings.push({ file, line: index + 1, reason })
    })
  }
  return findings
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

    const offenders = scan((line) => {
      for (const match of line.matchAll(numberPattern)) {
        const value = toNumber(match[0])
        if (isTelling(value) && secrets.has(Number(value.toFixed(4)))) {
          return `the amount \`${match[0]}\` is in var/: it is real data, invent another one`
        }
      }
      return null
    }, true)

    expect(report(offenders)).toEqual([])
  })

  it('copies no telling phrase of the local captures (skipped when they are absent or partial)', (context) => {
    const unavailable = comparisonUnavailable()
    if (unavailable) {
      context.skip(unavailable)
      return
    }

    const phrases = tellingPhrases(captureValuesText())
    expect(phrases.length).toBeGreaterThan(0)

    const offenders = scan(
      (text) => {
        const haystack = words(text).join(' ')
        const copied = phrases.find((phrase) => haystack.includes(phrase))
        return copied
          ? 'a three-word sequence copied from a file of var/ (a concept of his statement?)'
          : null
      },
      true,
      2,
    )

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
