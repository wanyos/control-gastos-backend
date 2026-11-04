// Checks the CONTRACT of feature 67 `investments-gains` (R15). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a rule that lives only in the code does not exist for whoever
// consumes the API. Behaviour is tested in `investments.gains.test.ts`.
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

/** Cents of a two-decimal string, as an integer: no float adds in the check. */
const cents = (amount: string) => Math.round(Number(amount) * 100)

// The closed list of reasons (R8). A literal list on purpose: a type is erased
// at runtime and what this file checks is the document.
const reasons = [
  'no_photo',
  'gain_not_reported',
  'gain_percent_not_reported',
  'maturity_not_found',
  'ambiguous',
  'below_principal',
  'missing_conditions',
]

interface ExampleProduct {
  gain: string | null
  invested: string | null
}

interface ExampleResponse {
  asOf: string
  total: { gain: string; invested: string; gainPercent: string | null; excluded: unknown[] }
  live: ExampleProduct[]
  closed: ExampleProduct[]
}

describe('the contract of GET /api/investments/gains (feature 67)', () => {
  it('the contract describes GET /api/investments/gains with the formula of its percent', () => {
    const text = section('### `GET /api/investments/gains`')
    expect(text).not.toBe('')
    const prose = flat(text)

    // The closed list of reasons.
    for (const reason of reasons) expect(prose).toContain(`\`${reason}\``)
    // The two formulas: the spread by days of a live deposit, and the percent of the total.
    expect(prose).toContain('gain = expectedGain × d / D')
    expect(prose).toContain('total.gainPercent = total.gain / total.invested × 100')
    // Only the live products add, and the closed ones carry their closing date.
    expect(prose).toContain('solo los productos de `live`')
    expect(prose).toContain('`closedOn`')

    // The example parses and its total adds up with its own `live` list.
    const blocks = jsonBlocks(text)
    expect(blocks).toHaveLength(1)
    const example = JSON.parse(blocks[0] ?? '') as ExampleResponse
    expect(Object.keys(example)).toEqual(['asOf', 'total', 'live', 'closed'])

    const entering = example.live.filter((product) => product.gain !== null)
    const gain = entering.reduce((sum, product) => sum + cents(product.gain ?? '0'), 0)
    const invested = entering.reduce((sum, product) => sum + cents(product.invested ?? '0'), 0)
    expect(cents(example.total.gain)).toBe(gain)
    expect(cents(example.total.invested)).toBe(invested)
    expect(example.total.gainPercent).toBe(((gain / invested) * 100).toFixed(2))
    expect(example.total.excluded).toHaveLength(example.live.length - entering.length)

    // The section is reachable from the paragraph that lists the readers.
    expect(flat(section('### Inversiones — quién las escribe y quién las lee'))).toContain(
      '[`GET /api/investments/gains`](#get-apiinvestmentsgains)',
    )
  })
})
