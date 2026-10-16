// Checks the CONTRACT of feature 57 `deposit-totals-interest-only` (R16). It
// reads `docs/api-contract.md`, not code: that document is what the frontend
// builds against, so a field or a rule that lives only in the code does not
// exist for whoever consumes the API. Behaviour is tested in
// `movements.deposits.test.ts` and `investments.deposit-movements.test.ts`.
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

/** Every ```json fenced block of a markdown text, in order (indented ones too). */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^[ \t]*```json\n([\s\S]*?)^[ \t]*```/gm)].map(
    (match) => match[1] ?? '',
  )
}

const flat = (text: string) => text.replace(/\s+/g, ' ')

// The names the backend serializes in `deposit` (design.md §2), in the order it
// writes them. A literal list on purpose: a type is erased at runtime and what
// this file checks is the document.
const depositFields = [
  'kind',
  'principal',
  'countedAmount',
  'ambiguous',
  'reason',
  'candidateMovementIds',
]
const kinds = ['opening', 'cancellation', 'maturity']
const reasons = ['principal_not_found', 'several_principals', 'opening_not_found']

describe('docs/api-contract.md — deposit movements in the totals (feature 57)', () => {
  it('api-contract: describes how each kind of deposit movement counts, the deposit field, the ambiguous ones and excludedFromTotals', () => {
    // ── GET /api/movements: the `deposit` field, key by key, with examples ──
    const listing = section('### `GET /api/movements`')
    expect(listing, 'the contract has no section for GET /api/movements').not.toBe('')

    const [responseExample] = jsonBlocks(listing)
    const response = JSON.parse(responseExample ?? '') as {
      movements: Record<string, unknown>[]
    }
    for (const movement of response.movements) {
      expect(movement, 'the response example carries no `deposit`').toHaveProperty('deposit')
    }

    for (const field of depositFields) {
      expect(listing, `the contract has no row for \`deposit.${field}\``).toMatch(
        new RegExp(`^\\s*\\| \`${field}\` \\| .+\\|$`, 'm'),
      )
    }
    for (const value of [...kinds, ...reasons]) {
      expect(listing, `the contract does not name \`"${value}"\``).toContain(`\`"${value}"\``)
    }

    const depositExamples = jsonBlocks(listing)
      .map((block) => {
        try {
          return JSON.parse(block) as unknown
        } catch {
          return null
        }
      })
      .filter((parsed): parsed is Record<string, unknown>[] => Array.isArray(parsed))
      .flat()
    expect(depositExamples.length, 'no example of a `deposit` object').toBeGreaterThan(0)
    for (const example of depositExamples) {
      expect(Object.keys(example)).toEqual(depositFields)
      expect(example.countedAmount).toMatch(/^\d+\.\d{2}$/)
    }
    // One example of each kind, and one ambiguous with its reason and candidates.
    for (const kind of kinds) {
      expect(
        depositExamples.some((example) => example.kind === kind),
        `no example of ${kind}`,
      ).toBe(true)
    }
    const ambiguous = depositExamples.find((example) => example.ambiguous === true)
    expect(ambiguous, 'no example of an ambiguous deposit movement').toBeDefined()
    expect(ambiguous?.principal).toBeNull()
    expect(ambiguous?.countedAmount).toBe('0.00')
    expect(reasons).toContain(ambiguous?.reason)

    // `deposit` travels only in GET /api/movements.
    expect(flat(listing)).toContain('`deposit` **solo** viaja en esta respuesta')

    // ── The rule, in its own section ──
    const rule = flat(section('#### Movimientos de depósito en las sumas'))
    expect(rule, 'the contract has no section for the deposit rule').not.toBe('')
    for (const prefix of ['APERTURA DEP', 'CANCELACION DEP', 'INTERESES DEP']) {
      expect(rule).toContain(`\`${prefix}\``)
    }
    expect(rule).toContain('**Apertura**: `0`')
    expect(rule).toContain('**Cancelación**: `0`')
    expect(rule).toContain('suma a `income` **solo su interés**, `amount − capital`')
    expect(rule).toContain('**Vencimiento dudoso** (sin capital cierto): `0`')
    expect(rule).toContain('`deposit.ambiguous: true`')
    expect(rule).toContain('`C ≤ M`')
    expect(rule).toContain('`M − C < C`')
    expect(rule).toContain('**Toda la historia, no el filtro.**')
    expect(rule).toContain(
      '**`excludedFromTotals`, `transferId` y `productId` no cambian lo que suma un movimiento de depósito.**',
    )
    expect(rule).toContain('20261016120000_deposit_movements_unmark')

    // ── excludedFromTotals: the model row says it too ──
    const model = flat(section('### `Movement`'))
    expect(model).toContain(
      '**Desde la feature 57, en un movimiento de depósito la marca no cambia lo que suma**',
    )
    // The note on transfers: a leg that is a deposit movement still adds its own sum.
    const modelProse = flat(section('### `Movement`').replace(/^> ?/gm, ''))
    expect(modelProse).toContain(
      'salvo, desde la feature 57, una pierna que sea un movimiento de depósito',
    )

    // ── The body row of both PATCH routes carries the same exception ──
    for (const heading of ['### `PATCH /api/movements`', '### `PATCH /api/movements/:id`']) {
      const row = section(heading)
        .split('\n')
        .find((line) => line.startsWith('| `excludedFromTotals` |'))
      expect(row, `${heading} has no body row for \`excludedFromTotals\``).toBeDefined()
      expect(row).toContain(
        'salvo en un movimiento de depósito, donde la marca se guarda pero no cambia lo que suma',
      )
    }

    // ── GET /api/overview follows the same rule ──
    const overview = flat(section('### `GET /api/overview`'))
    expect(overview).toContain('`period.totals` sigue la misma regla de depósitos')
  })
})
