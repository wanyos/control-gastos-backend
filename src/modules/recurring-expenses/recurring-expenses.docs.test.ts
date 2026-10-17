// Checks the CONTRACT of feature 58 `recurring-expenses` (R15). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a field or a rule that lives only in the code does not exist for
// whoever consumes the API. Behaviour is tested in `recurring-expenses.test.ts`.
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

// The names the backend serializes (design.md §5), in the order it writes them.
// A literal list on purpose: a type is erased at runtime and what this file
// checks is the document.
const responseFields = ['period', 'monthlyTotal', 'bills', 'transfersToPeople', 'variable']
const billFields = [
  'key',
  'name',
  'periodicity',
  'usualAmount',
  'count',
  'lastDate',
  'lastMonth',
  'lastMonthAmount',
  'previousMonth',
  'previousMonthAmount',
  'change',
  'hasIncreased',
  'monthlyCost',
  'movements',
]
const groupFields = ['months', 'monthlyCost', 'movements']
const movementFields = ['id', 'accountId', 'bookingDate', 'amount', 'description']
const periodicities = [
  'once',
  'twice_monthly',
  'monthly',
  'every_two_months',
  'every_three_months',
  'every_six_months',
  'annual',
]

interface Group {
  months: { month: string; amount: string }[]
  monthlyCost: string
  movements: Record<string, unknown>[]
}
interface Example {
  period: { from: string; to: string; months: string[] }
  monthlyTotal: string
  bills: (Record<string, unknown> & { monthlyCost: string; movements: Group['movements'] })[]
  transfersToPeople: Group
  variable: (Group & { category: unknown })[]
}

/** Cents of a two-decimal string, as an integer: no float adds in the check. */
const cents = (amount: string) => Math.round(Number(amount) * 100)

describe('docs/api-contract.md — GET /api/recurring-expenses (feature 58)', () => {
  it('api-contract: describes GET /api/recurring-expenses, its groups, its monthly total and the movements of each one', () => {
    const text = section('### `GET /api/recurring-expenses`')
    expect(text, 'the contract has no section for GET /api/recurring-expenses').not.toBe('')
    const prose = flat(text)

    // ── The example: parses and has every key, in the order the code writes them ──
    const [exampleBlock] = jsonBlocks(text)
    const example = JSON.parse(exampleBlock ?? '') as Example
    expect(Object.keys(example)).toEqual(responseFields)
    expect(Object.keys(example.period)).toEqual(['from', 'to', 'months'])
    expect(example.period.months).toHaveLength(12)
    expect(example.bills.length).toBeGreaterThan(0)
    for (const bill of example.bills) {
      expect(Object.keys(bill)).toEqual(billFields)
      expect(periodicities).toContain(bill.periodicity)
      for (const movement of bill.movements) expect(Object.keys(movement)).toEqual(movementFields)
    }
    expect(Object.keys(example.transfersToPeople)).toEqual(groupFields)
    expect(example.variable.length).toBeGreaterThan(0)
    for (const entry of example.variable) {
      expect(Object.keys(entry)).toEqual(['category', ...groupFields])
    }
    for (const group of [example.transfersToPeople, ...example.variable]) {
      expect(group.months.map((month) => month.month)).toEqual(example.period.months)
      for (const movement of group.movements) expect(Object.keys(movement)).toEqual(movementFields)
    }
    // The entry of the expenses with no category is shown.
    expect(example.variable.some((entry) => entry.category === null)).toBe(true)
    // The example adds up: monthlyTotal is the sum of every monthlyCost.
    const costs = [
      ...example.bills.map((bill) => bill.monthlyCost),
      example.transfersToPeople.monthlyCost,
      ...example.variable.map((entry) => entry.monthlyCost),
    ]
    expect(costs.reduce((total, cost) => total + cents(cost), 0)).toBe(cents(example.monthlyTotal))

    // ── Every field of a bill has its row; the seven periodicities are named ──
    for (const field of billFields) {
      expect(text, `the contract has no row for \`${field}\``).toMatch(
        new RegExp(`^\\s*\\| [^|]*\`${field}\`[^|]*\\| .+\\|$`, 'm'),
      )
    }
    for (const value of periodicities) {
      expect(text, `the contract does not name \`"${value}"\``).toContain(`| \`"${value}"\` |`)
    }
    expect(prose).toContain('**Sin umbral**: un céntimo más ya es subida')

    // ── Which movements enter, and how each group is recognized ──
    expect(prose).toContain('`isCountedExpense`')
    expect(prose).toContain('`excludedFromTotals`')
    expect(prose).toContain('empieza** por `recibo`, `recib` o `tributo`')
    expect(prose).toContain('la palabra `bizum` entera')
    expect(prose).toContain('`TRANS`, `TRANSF`, `TRANSF.`, `TRANSFER…`, `TRASPASO…`')
    expect(prose).toContain('**toda palabra que lleve una cifra**')
    expect(prose).toContain('**dos primeras palabras**')

    // ── Period, monthlyCost and monthlyTotal ──
    expect(prose).toContain('**12 meses completos anteriores al mes en curso**')
    expect(prose).toContain('**entre 12**')
    expect(prose).toContain('`monthlyTotal` es la suma de los `monthlyCost` **ya redondeados**')

    // ── The movements of each entry travel in the response ──
    expect(prose).toContain('**Los movimientos de cada entrada vienen en esta misma respuesta**')
    expect(prose).toContain('no hay otra consulta para pedirlos')

    // ── Empty answer and read-only ──
    expect(prose).toContain('**Respuesta vacía.**')
    expect(prose).toContain('este endpoint **no escribe nada**')
  })
})
