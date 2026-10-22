// Checks the CONTRACT of feature 63 `expenses-by-category` (R15). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a parameter, a field or a rule that lives only in the code does
// not exist for whoever consumes the API. Behaviour is tested in
// `expenses-by-category.test.ts` and `categories.test.ts`.
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

// The names the backend serializes (design.md §5), in the order of
// `expenses-by-category.schema.ts`. A literal list on purpose: a type is erased
// at runtime and what this file checks is the document.
const responseFields = [
  'period',
  'compared',
  'compare',
  'amount',
  'comparedAmount',
  'difference',
  'fixed',
  'variable',
]
const groupFields = ['amount', 'comparedAmount', 'difference', 'lines']
const lineFields = [
  'category',
  'amount',
  'comparedAmount',
  'difference',
  'change',
  'monthlyAmount',
  'movements',
]
const categoryFields = ['id', 'name', 'parentId', 'isFixed']
const movementFields = ['id', 'bookingDate', 'description', 'amount', 'accountId']

interface Line {
  category: { isFixed: boolean } | null
  amount: string
  comparedAmount: string
  difference: string
  change: string | null
  movements: { amount: string }[]
}
interface Group {
  amount: string
  comparedAmount: string
  difference: string
  lines: Line[]
}
interface Example {
  period: Record<string, unknown>
  compared: Record<string, unknown>
  amount: string
  comparedAmount: string
  difference: string
  fixed: Group
  variable: Group
}

describe('docs/api-contract.md — GET /api/expenses-by-category (feature 63)', () => {
  it('the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses', () => {
    const text = section('### `GET /api/expenses-by-category`')
    expect(text, 'the contract has no section for GET /api/expenses-by-category').not.toBe('')
    const prose = flat(text)

    // ── Parameters: one row each, and the two values of `compare` ──
    for (const parameter of ['month', 'year', 'compare']) {
      expect(text, `the contract has no row for \`${parameter}\``).toMatch(
        new RegExp(`^\\| \`${parameter}\` +\\| .+\\|$`, 'm'),
      )
    }
    expect(text).toContain('`"previous-month"` \\| `"same-month-last-year"`')
    expect(prose).toContain('exactamente uno de `month` y `year`')
    expect(prose).toContain('**Solo con `month`.**')

    // ── Periods: the year in progress against the same months of the year before ──
    expect(prose).toContain('comparado con **los mismos meses del año anterior**')
    expect(prose).toContain('comparado con el año anterior entero')

    // ── Which expense enters: the one rule of the overview ──
    expect(prose).toContain('`isCountedExpense`')
    expect(prose).toContain('`excludedFromTotals: true`')
    expect(prose).toContain('`period.totals.expense`')
    expect(prose).toContain('Agrupa **solo por categoría**')

    // ── The example: parses, has every key in the serialized order, and adds up ──
    const [exampleBlock] = jsonBlocks(text)
    const example = JSON.parse(exampleBlock ?? '') as Example
    expect(Object.keys(example)).toEqual(responseFields)
    expect(Object.keys(example.period)).toEqual(['month', 'year', 'from', 'to', 'months'])
    expect(Object.keys(example.compared)).toEqual(['from', 'to', 'months'])
    const lines: Line[] = []
    for (const [name, group] of [
      ['fixed', example.fixed],
      ['variable', example.variable],
    ] as const) {
      expect(Object.keys(group)).toEqual(groupFields)
      for (const line of group.lines) {
        expect(Object.keys(line)).toEqual(lineFields)
        if (line.category !== null) {
          expect(Object.keys(line.category)).toEqual(categoryFields)
          expect(line.category.isFixed, `a line of ${name} with the wrong mark`).toBe(
            name === 'fixed',
          )
        }
        for (const movement of line.movements) {
          expect(Object.keys(movement)).toEqual(movementFields)
        }
        expect(cents(line.difference)).toBe(cents(line.amount) - cents(line.comparedAmount))
        expect(line.movements.reduce((total, m) => total + cents(m.amount), 0)).toBe(
          cents(line.amount),
        )
        lines.push(line)
      }
      expect(group.lines.reduce((total, line) => total + cents(line.amount), 0)).toBe(
        cents(group.amount),
      )
      expect(group.lines.reduce((total, line) => total + cents(line.comparedAmount), 0)).toBe(
        cents(group.comparedAmount),
      )
    }
    expect(cents(example.amount)).toBe(cents(example.fixed.amount) + cents(example.variable.amount))
    expect(cents(example.comparedAmount)).toBe(
      cents(example.fixed.comparedAmount) + cents(example.variable.comparedAmount),
    )
    // The example shows a new line, a gone one and the line with no category.
    expect(lines.map((line) => line.change)).toEqual(expect.arrayContaining(['new', 'gone']))
    expect(lines.some((line) => line.category === null)).toBe(true)

    // ── Every field of a line has its row ──
    for (const field of lineFields) {
      expect(text, `the contract has no row for \`${field}\``).toMatch(
        new RegExp(`^\\s*\\| \`${field}\` \\| .+\\|$`, 'm'),
      )
    }
    expect(prose).toContain('`"previous-year"` siempre con `year`')

    // ── Errors and read-only ──
    expect(text).toMatch(/^\| 400 +\| `VALIDATION_ERROR` \| .+\|$/m)
    expect(prose).toContain('este endpoint **no escribe nada**')

    // ── The category carries `isFixed`, and the PATCH changes it ──
    const model = section('### `Category`')
    expect(model).toMatch(/^\| `isFixed` +\| boolean +\| .+\|$/m)
    const patch = section('### `PATCH /api/categories/:id`')
    expect(patch).toMatch(/^\| `isFixed` \| boolean \| no +\| .+\|$/m)
    expect(flat(patch)).not.toContain('**Solo cambia el `name`**')
    const listed = JSON.parse(jsonBlocks(section('### `GET /api/categories`'))[0] ?? '') as {
      isFixed: unknown
    }[]
    expect(listed[0]?.isFixed).toBe(false)

    // ── GET /api/recurring-expenses keeps answering and will be retired ──
    const recurring = flat(section('### `GET /api/recurring-expenses`'))
    expect(recurring, 'the contract has no section for GET /api/recurring-expenses').not.toBe('')
    expect(recurring).toContain('**Se retirará (decidido en la feature 63, 2026-10-21).**')
    expect(recurring).toContain('**sigue respondiendo igual**')
    expect(recurring).toContain('**cuando el frontend use la consulta nueva**')
    expect(recurring).toContain('[`GET /api/expenses-by-category`](#get-apiexpenses-by-category)')
  })
})
