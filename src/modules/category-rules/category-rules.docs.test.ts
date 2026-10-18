// Checks the CONTRACT of feature 56 `categorized-movements-list`. It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a field that lives only in the code does not exist for whoever
// consumes the API. Behaviour is tested in `category-rules.service.test.ts` and
// `category-rules.routes.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const contract = readFileSync(join(repoRoot, 'docs', 'api-contract.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
)

/** From a `### ` heading to the next `### ` or `## ` heading. */
function routeSection(heading: string): string {
  const start = contract.indexOf(`\n${heading}\n`)
  if (start === -1) return ''
  const rest = contract.slice(start + 1 + heading.length)
  const end = rest.search(/\n#{2,3} /)
  return end === -1 ? rest : rest.slice(0, end)
}

/** Every ```json fenced block of a markdown text, in order. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] ?? '')
}

// The names the backend serializes (`CategorizedMovement` in
// `category-rules.types.ts`), in the order it writes them. A literal list on
// purpose: a type is erased at runtime and what this file checks is the document.
const categorizedMovementFields = [
  'movementId',
  'description',
  'bookingDate',
  'amount',
  'type',
  'categoryId',
  'categoryName',
  'rules',
]
const ruleFields = ['ruleId', 'matchText']
const resultFields = [
  'categorized',
  'categorizedMovements',
  'conflictCount',
  'conflicts',
  'unmatched',
  'error',
]

interface ExampleMovement extends Record<string, unknown> {
  amount: string
  bookingDate: string
  type: string
  rules: Record<string, unknown>[]
}

interface ExampleResult {
  categorized: number
  categorizedMovements: ExampleMovement[]
}

describe('docs/api-contract.md — the list of categorized movements (feature 56)', () => {
  it('api-contract: describes categorizedMovements in apply and in the import report', () => {
    // ── POST /api/category-rules/apply: field by field, with its example ──
    const apply = routeSection('### `POST /api/category-rules/apply`')
    expect(apply, 'the contract has no section for the apply route').not.toBe('')

    const [applyExample] = jsonBlocks(apply)
    expect(applyExample, 'the apply route publishes no json example').toBeDefined()
    const applyAnswer = JSON.parse(applyExample ?? '') as ExampleResult
    expect(Object.keys(applyAnswer)).toEqual(resultFields)
    expect(applyAnswer.categorizedMovements.length).toBeGreaterThan(0)
    expect(applyAnswer.categorizedMovements).toHaveLength(applyAnswer.categorized)
    for (const movement of applyAnswer.categorizedMovements) {
      expect(Object.keys(movement)).toEqual(categorizedMovementFields)
      expect(movement.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(movement.amount).toMatch(/^\d+\.\d{2}$/)
      expect(['income', 'expense']).toContain(movement.type)
      expect(movement.rules.length).toBeGreaterThan(0)
      for (const rule of movement.rules) expect(Object.keys(rule)).toEqual(ruleFields)
    }
    // The example shows that more than one rule can match the same movement.
    expect(applyAnswer.categorizedMovements.some((movement) => movement.rules.length > 1)).toBe(
      true,
    )

    // The prose after the example: one table row per field, and the rules of the list.
    const prose = apply.slice(apply.indexOf('```', apply.indexOf('```json') + 7))
    for (const field of categorizedMovementFields) {
      expect(prose, `the contract has no row for \`${field}\``).toMatch(
        new RegExp(`^\\| \`${field}\` \\| \\w+ \\| .+\\|$`, 'm'),
      )
    }
    for (const field of ruleFields) {
      expect(prose, `the contract does not name \`${field}\``).toContain(`\`${field}\``)
    }
    const flatProse = prose.replace(/\s+/g, ' ')
    expect(flatProse).toContain('**Siempre presente**; `[]` si no se escribió ninguno')
    expect(flatProse).toContain('tantos elementos como diga `categorized`')
    expect(flatProse).toContain('no se acota ni se pagina')
    expect(flatProse).toContain('Ordenada por `movementId` **ascendente**')
    expect(flatProse).toContain('`YYYY-MM-DD`')

    // ── POST /api/import: says explicitly that the field travels there too ──
    const importReport = routeSection('### `POST /api/import`')
    expect(importReport, 'the contract has no section for the import route').not.toBe('')

    const bulletStart = importReport.indexOf('- `categorization` (feature 43)')
    expect(bulletStart, 'the import route does not describe `categorization`').toBeGreaterThan(-1)
    const bullet = importReport.slice(bulletStart, importReport.indexOf('\n> ', bulletStart))
    const row = bullet.split('\n').find((line) => line.includes('| `categorizedMovements` |'))
    expect(row, '`categorization` has no row for `categorizedMovements`').toBeDefined()
    expect(row).toContain('**Viaja también aquí**')
    expect(row).toContain('POST /api/category-rules/apply')
    for (const field of [...categorizedMovementFields, ...ruleFields]) {
      expect(row, `the import report does not name \`${field}\``).toContain(`\`${field}\``)
    }

    // The example of the report carries the field with the same shape.
    const reportExample = jsonBlocks(importReport)
      .map((block) => {
        try {
          return JSON.parse(block) as { categorization?: ExampleResult }
        } catch {
          return {}
        }
      })
      .find((block) => block.categorization !== undefined)
    expect(reportExample, 'no example of the import report carries `categorization`').toBeDefined()
    const reported = reportExample?.categorization?.categorizedMovements ?? []
    expect(reported).toHaveLength(reportExample?.categorization?.categorized ?? -1)
    expect(reported.length).toBeGreaterThan(0)
    for (const movement of reported) {
      expect(Object.keys(movement)).toEqual(categorizedMovementFields)
    }
  })
})

// Feature 60 `category-origin-and-rule-reapply`: where a movement's category came
// from, and what creating, changing or deleting a rule recategorizes (R15).
describe('docs/api-contract.md — categorySource and what a rule recategorizes (feature 60)', () => {
  it('api-contract: says what a rule recategorizes and what not, and describes categorySource', () => {
    // ── ### Movement: one row for the new field, with its three values ──
    const movement = routeSection('### `Movement`')
    expect(movement, 'the contract has no section for the Movement model').not.toBe('')
    const row = movement.split('\n').find((line) => line.startsWith('| `categorySource`'))
    expect(row, 'the Movement table has no row for `categorySource`').toBeDefined()
    for (const value of ['"manual"', '"rule"', '"closing"']) {
      expect(row, `the categorySource row does not name ${value}`).toContain(value)
    }
    expect(row).toContain('PATCH /api/movements/:id')
    expect(row).toContain('POST /api/movements/confirm-all')

    // ── ### POST /api/category-rules: what it recategorizes, and its example ──
    const create = routeSection('### `POST /api/category-rules`')
    expect(create, 'the contract has no section for creating a rule').not.toBe('')
    const flatCreate = create.replace(/\s+/g, ' ')
    for (const word of [
      '`categorization`',
      '`categorySource: "closing"`',
      '`categorySource: "manual"`',
    ]) {
      expect(flatCreate, `creating a rule does not name ${word}`).toContain(word)
    }
    expect(flatCreate).toContain('**todas** las reglas')
    expect(flatCreate).toContain('no se ejecuta la pasada')

    const [createExample] = jsonBlocks(create)
    expect(createExample, 'creating a rule publishes no json example').toBeDefined()
    const answer = JSON.parse(createExample ?? '') as {
      matchText: string
      categoryId: number
      categorization: ExampleResult & { conflicts: unknown[]; unmatched: number }
    }
    // The rule's own fields stay at the root; `categorization` is the run's result.
    expect(typeof answer.matchText).toBe('string')
    expect(Object.keys(answer.categorization)).toEqual(
      resultFields.filter((field) => field !== 'error'),
    )
    expect(answer.categorization.categorizedMovements).toHaveLength(
      answer.categorization.categorized,
    )
    for (const moved of answer.categorization.categorizedMovements) {
      expect(Object.keys(moved)).toEqual(categorizedMovementFields)
      expect(moved.categoryId).toBe(answer.categoryId)
    }

    // ── ### PATCH /api/category-rules/:id runs the same pass ──
    const change = routeSection('### `PATCH /api/category-rules/:id`').replace(/\s+/g, ' ')
    expect(change).toContain('`categorization`')
    expect(change).toContain('`"closing"`')

    // ── ### DELETE /api/category-rules/:id: neither the category nor its source ──
    const remove = routeSection('### `DELETE /api/category-rules/:id`').replace(/\s+/g, ' ')
    expect(remove).toContain('**sin modificar ningún movimiento**')
    expect(remove).toContain('el mismo `categorySource`')

    // ── ### POST /api/category-rules/apply keeps its scope ──
    const apply = routeSection('### `POST /api/category-rules/apply`').replace(/\s+/g, ' ')
    expect(apply).toContain('su alcance **no cambia**')
  })
})
