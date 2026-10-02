// Guardian of the DOCUMENTS of feature 52 (R8, R9, R13, R14). It reads `docs/`
// and `README.md`, not code: the eight routes this feature retired answer 404
// (that is `architecture.test.ts`), and what this file checks is that no document
// that describes how the project works TODAY still presents them as alive.
//
// The contract may name them in ONE place, its section «Rutas retiradas», which
// is the visible notice of the breaking change. `docs/architecture.md` is not in
// the list of R13 on purpose: an ADR is history and is never rewritten.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

/** A document of the repository, with its line endings normalized to `\n`. */
function read(...segments: string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n')
}

const retiredRoutes = [
  '/api/parser/bankinter',
  '/api/parser/myinvestor',
  '/api/parser/n26',
  '/api/parser/openbank',
  '/api/parser/revolut',
  '/api/parser/trade-republic',
  '/api/import/local',
  '/api/ingestion/process',
]

const retiredErrorCode = 'LOCAL_COPY_NOT_FOUND'

// The six parser routes are also written generically (`/api/parser/<banco>`), so
// the prefix alone counts as naming them.
const routePatterns = [
  /\/api\/parser\//,
  /\/api\/import\/local(?![\w-])/,
  /\/api\/ingestion\/process(?![\w-])/,
]

// The two local folders of R13.
const localFolderPattern = /(?<![\w/.-])var\/(?:drive-read|parsed)/

const retiredHeading = '## Rutas retiradas'
const errorsHeading = '## Errores'

/** Splits the contract into its «Rutas retiradas» section and everything else. */
function splitContract(contract: string): { retired: string; rest: string } {
  const start = contract.indexOf(`\n${retiredHeading}\n`)
  if (start === -1) return { retired: '', rest: contract }
  const afterHeading = start + 1 + retiredHeading.length
  const next = contract.indexOf('\n## ', afterHeading)
  const end = next === -1 ? contract.length : next
  return {
    retired: contract.slice(start + 1, end),
    // Blank lines keep the line numbers of `rest` equal to those of the file.
    rest:
      contract.slice(0, start + 1) +
      contract.slice(start + 1, end).replace(/[^\n]/g, '') +
      contract.slice(end),
  }
}

/** `file:line` of every line of `text` that matches one of the patterns. */
function linesMatching(file: string, text: string, patterns: RegExp[]): string[] {
  return text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => patterns.some((pattern) => pattern.test(line)))
    .map(({ number }) => `${file}:${number}`)
}

/** The text of one ADR: from its heading to the next ADR or the next `## `. */
function adrSection(architecture: string, number: string): string {
  const start = architecture.indexOf(`\n### ADR-${number}: `)
  if (start === -1) return ''
  const rest = architecture.slice(start + 1)
  const end = rest.slice(1).search(/\n(?:### ADR-\d{3}: |## )/)
  return end === -1 ? rest : rest.slice(0, end + 1)
}

describe('docs/api-contract.md — the eight routes retired by feature 52', () => {
  const contract = read('docs', 'api-contract.md')
  const { retired, rest } = splitContract(contract)

  it('api-contract: names the eight retired routes only inside "Rutas retiradas"', () => {
    expect(retired).not.toBe('')

    const offenders = linesMatching('docs/api-contract.md', rest, [
      ...routePatterns,
      new RegExp(retiredErrorCode),
    ])

    expect(offenders).toEqual([])
  })

  it('api-contract: has the "Rutas retiradas" section before "Errores", naming the eight, the date and feature 52', () => {
    const retiredAt = contract.indexOf(`\n${retiredHeading}\n`)
    const errorsAt = contract.indexOf(`\n${errorsHeading}\n`)

    expect(retiredAt).toBeGreaterThan(-1)
    expect(errorsAt).toBeGreaterThan(retiredAt)
    // Right before it: no other `## ` section sits between the two.
    expect(contract.slice(retiredAt + 1, errorsAt).match(/^## /gm)).toHaveLength(1)

    const missing = retiredRoutes.filter((route) => !retired.includes(`\`POST ${route}\``))
    expect(retiredRoutes).toHaveLength(8)
    expect(missing).toEqual([])

    expect(retired).toContain('2026-10-02')
    expect(retired).toMatch(/feature 52/)
    expect(retired).toContain('BREAKING CHANGE')
    expect(retired).toContain('404')
    // What is used instead, and the error code that went away with them.
    expect(retired).toContain('Qué se usa ahora')
    expect(retired).toContain('`POST /api/import`')
    expect(retired).toContain(retiredErrorCode)
  })
})

describe('the documents that describe how the project works today', () => {
  const documents = [
    ['README.md'],
    ['docs', 'verification.md'],
    ['docs', 'conventions.md'],
    ['docs', 'dar-de-alta-un-banco.md'],
    ['docs', 'archivos-por-banco.md'],
    ['docs', 'data-model.md'],
    ['docs', 'myinvestor-product-files.md'],
    ['docs', 'trade-republic-product-files.md'],
  ]

  it('the documents that describe today name no retired route nor var/drive-read nor var/parsed', () => {
    const offenders = documents.flatMap((segments) =>
      linesMatching(segments.join('/'), read(...segments), [...routePatterns, localFolderPattern]),
    )

    expect(documents).toHaveLength(8)
    expect(offenders).toEqual([])
  })
})

describe('docs/architecture.md — the decision is written down without rewriting an ADR', () => {
  const architecture = read('docs', 'architecture.md')

  it('architecture: ADR-032 exists, ADR-029 is superseded by it and ten ADRs carry the review line of feature 52', () => {
    const adr032 = adrSection(architecture, '032')
    expect(adr032).not.toBe('')
    expect(adr032).toMatch(/\*\*Estado:\*\* aceptada/)
    expect(adr032).toMatch(/feature #?52/)

    expect(adrSection(architecture, '029')).toContain('**Estado:** superada por ADR-032')

    const reviewLine = 'Revisado el 2026-10-02 por la feature 52 `remove-var`'
    const reviewed = ['009', '010', '014', '015', '016', '017', '020', '024', '025', '026']
    const missing = reviewed.filter(
      (number) => !adrSection(architecture, number).includes(reviewLine),
    )

    expect(reviewed).toHaveLength(10)
    expect(missing).toEqual([])
    // Ten and no more: the line is not sprinkled over ADRs the feature left alone.
    expect(architecture.split(reviewLine)).toHaveLength(reviewed.length + 1)
  })
})
