// Checks the CONTRACT of feature 69 `last-imports` (R16). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a rule that lives only in the code does not exist for whoever
// consumes the API. Behaviour is tested in `last-imports.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const contract = readFileSync(join(repoRoot, 'docs', 'api-contract.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
)

/** From a heading line to the next heading of the same level or above. */
function section(heading: string): string {
  const start = contract.indexOf(`\n${heading}\n`)
  if (start === -1) return ''
  const level = /^#+/.exec(heading)?.[0].length ?? 3
  const rest = contract.slice(start + 1 + heading.length)
  const end = rest.search(new RegExp(`\\n#{2,${level}} `))
  return end === -1 ? rest : rest.slice(0, end)
}

/** Every ```json fenced block of a markdown text, in order. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^[ \t]*```json\n([\s\S]*?)^[ \t]*```/gm)].map(
    (match) => match[1] ?? '',
  )
}

const flat = (text: string) => text.replace(/\s+/g, ' ')

// The keys of the response, in the order the route serializes them (R1, R2, R7).
// Literal lists on purpose: a type is erased at runtime and what this file
// checks is the document.
const accountKeys = [
  'accountId',
  'bank',
  'alias',
  'dataUntil',
  'importedAt',
  'expectedMonthly',
  'gaps',
]
const productKeys = [
  'productId',
  'bank',
  'name',
  'type',
  'maturityDate',
  'dataUntil',
  'importedAt',
  'expectedMonthly',
  'gaps',
]

interface ExampleEntry {
  expectedMonthly: boolean
  maturityDate?: string | null
  gaps: { from: string; to: string }[]
}

interface ExampleResponse {
  asOf: string
  accounts: ExampleEntry[]
  products: ExampleEntry[]
}

describe('the contract of GET /api/last-imports (feature 69)', () => {
  it('the contract describes GET /api/last-imports', () => {
    const text = section('### `GET /api/last-imports`')
    expect(text).not.toBe('')
    const prose = flat(text)

    // Every field, named in the section.
    for (const key of ['asOf', 'accounts', 'products', ...accountKeys, ...productKeys]) {
      expect(prose).toContain(`\`${key}\``)
    }
    // The live rule, expectedMonthly, the two gap rules and importedAt.
    expect(prose).toContain('**posterior a hoy**')
    expect(prose).toContain('`expectedMonthly: false` y `gaps: []`')
    expect(prose).toContain('**más de 31 días**')
    expect(prose).toContain('**dentro de un mismo extracto nunca hay tramo**')
    expect(prose).toContain('cada racha de meses naturales sin ninguna foto es un tramo')
    expect(prose).toContain('**día en Madrid**')
    expect(prose).toContain('**Lo importado antes de la feature 69.**')

    // The example parses, with the keys in order and coherent rules.
    const blocks = jsonBlocks(text)
    expect(blocks).toHaveLength(1)
    const example = JSON.parse(blocks[0] ?? '') as ExampleResponse
    expect(Object.keys(example)).toEqual(['asOf', 'accounts', 'products'])
    for (const account of example.accounts) {
      expect(Object.keys(account)).toEqual(accountKeys)
      expect(account.expectedMonthly).toBe(true)
    }
    for (const product of example.products) {
      expect(Object.keys(product)).toEqual(productKeys)
      expect(product.expectedMonthly).toBe(product.maturityDate === null)
      if (!product.expectedMonthly) expect(product.gaps).toEqual([])
    }

    // The section is reachable from the paragraph that lists the readers of
    // the investment tables.
    expect(flat(section('### Inversiones — quién las escribe y quién las lee'))).toContain(
      '[`GET /api/last-imports`](#get-apilast-imports)',
    )
  })
})
