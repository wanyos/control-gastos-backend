// Checks the CONTRACT of feature 62 `own-accounts` (R15). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a route, a field or a rule that lives only in the code does not
// exist for whoever consumes the API. Behaviour is tested in
// `own-accounts.routes.test.ts`, `own-accounts.recognition.test.ts` and
// `own-accounts.totals.test.ts`.
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

// The names `serializeOwnAccount` writes (design.md §7), in its order. A literal
// list on purpose: a type is erased at runtime and what this file checks is the
// document.
const ownAccountFields = [
  'id',
  'name',
  'bank',
  'accountNumber',
  'type',
  'openedAt',
  'closedAt',
  'texts',
  'createdAt',
  'updatedAt',
]
const ownAccountTypes = ['checking', 'savings', 'investment', 'deposit', 'crypto', 'other']
const ownershipFields = ['status', 'ownAccountId', 'ownAccountName', 'matchedText']
const statuses = ['own', 'doubtful', 'mine', 'not_mine']

describe('docs/api-contract.md — own accounts (feature 62)', () => {
  it('api-contract: describes the own accounts table, the recognition, the doubtful movements and how to resolve them', () => {
    // ── The five routes, each with its own heading ──
    for (const route of [
      'GET /api/own-accounts',
      'POST /api/own-accounts',
      'PATCH /api/own-accounts/:id',
      'GET /api/own-accounts/holder-names',
      'PUT /api/own-accounts/holder-names',
    ]) {
      expect(section(`### \`${route}\``), `the contract has no section for ${route}`).not.toBe('')
    }

    // ── The OwnAccount model: every field in a json example, and the types ──
    const model = section('### `OwnAccount`')
    expect(model, 'the contract has no OwnAccount model').not.toBe('')
    const [example] = jsonBlocks(model)
    expect(Object.keys(JSON.parse(example ?? '{}') as object)).toEqual(ownAccountFields)
    for (const field of ownAccountFields) {
      expect(model, `the OwnAccount model has no row for \`${field}\``).toMatch(
        new RegExp(`^\\| \`${field}\` +\\| .+\\|$`, 'm'),
      )
    }
    for (const type of ownAccountTypes) expect(model).toContain(`\`"${type}"\``)
    const list = JSON.parse(jsonBlocks(section('### `GET /api/own-accounts`'))[0] ?? '{}') as {
      ownAccounts?: object[]
    }
    expect(list.ownAccounts?.length).toBeGreaterThan(0)
    for (const row of list.ownAccounts ?? []) expect(Object.keys(row)).toEqual(ownAccountFields)
    expect(flat(section('### `PATCH /api/own-accounts/:id`'))).toContain(
      '`texts`, si viaja, **sustituye la lista entera**',
    )
    expect(flat(section('### `PUT /api/own-accounts/holder-names`'))).toContain(
      'Sustituye las formas de tu nombre por **exactamente** la lista que viaja',
    )

    // ── How a movement is recognized, and when it is doubtful ──
    const rule = flat(section('#### Movimientos entre tus cuentas en las sumas'))
    expect(rule, 'the contract has no section for the recognition').not.toBe('')
    expect(rule).toContain('**como palabras enteras**')
    expect(rule).toContain('**Cuándo un texto es el nombre de un banco.**')
    expect(rule).toContain('**Solo casa textos que son el nombre de un banco** → `"doubtful"`')
    expect(rule).toContain('**El campo `bank` de la tabla nunca reconoce nada por sí solo.**')
    expect(rule).toContain('`"doubtful"`: **sigue contando**')
    expect(rule).toContain('**Se calcula en cada lectura y no se guarda nada**')
    for (const route of [
      '`GET /api/movements`',
      '`GET /api/overview`',
      '`GET /api/expenses-by-category`',
    ]) {
      expect(rule).toContain(route)
    }

    // ── GET /api/movements: the `ownership` field, its four statuses, the filter ──
    const listing = section('### `GET /api/movements`')
    const response = JSON.parse(jsonBlocks(listing)[0] ?? '{}') as {
      movements: Record<string, unknown>[]
    }
    for (const movement of response.movements) {
      expect(movement).toHaveProperty('ownership')
      expect(movement).toHaveProperty('ownershipDecision')
    }
    for (const field of ownershipFields) {
      expect(listing, `the contract has no row for \`ownership.${field}\``).toMatch(
        new RegExp(`^\\s*\\| \`${field}\` \\| .+\\|$`, 'm'),
      )
    }
    for (const status of statuses) expect(listing).toContain(`\`"${status}"\``)
    const ownershipExamples = jsonBlocks(listing)
      .map((block) => JSON.parse(block) as Record<string, unknown>)
      .filter((parsed) => !Array.isArray(parsed) && 'status' in parsed)
    expect(ownershipExamples.length, 'no example of an `ownership` object').toBeGreaterThan(0)
    for (const ownership of ownershipExamples) {
      expect(Object.keys(ownership)).toEqual(ownershipFields)
      expect(statuses).toContain(ownership.status)
    }
    expect(listing).toMatch(/^\| `ownership` +\| `"doubtful"` +\| .+\|$/m)
    expect(flat(listing)).toContain('`ownership=doubtful`')

    // ── How to resolve one: PATCH /api/movements/:id, and not the bulk one ──
    const patchOne = section('### `PATCH /api/movements/:id`')
    const decisionRow = patchOne
      .split('\n')
      .find((line) => line.startsWith('| `ownershipDecision` |'))
    expect(
      decisionRow,
      'PATCH /api/movements/:id has no body row for ownershipDecision',
    ).toBeDefined()
    for (const value of ['`"mine"`', '`"not_mine"`', 'null']) expect(decisionRow).toContain(value)
    expect(flat(section('### `PATCH /api/movements`'))).toContain(
      '**`ownershipDecision` (feature 62) no se admite aquí**',
    )

    // ── The Movement model names the column and its only writer ──
    const movementModel = section('### `Movement`')
    expect(
      movementModel.split('\n').find((line) => line.startsWith('| `ownershipDecision` |')),
    ).toContain('Lo escribe **solo** [`PATCH /api/movements/:id`]')

    // ── The other two sums point to the same rule (the third one is
    //    GET /api/expenses-by-category since feature 64 retired GET /api/recurring-expenses) ──
    for (const heading of ['### `GET /api/overview`', '### `GET /api/expenses-by-category`']) {
      expect(section(heading)).toContain('(#movimientos-entre-tus-cuentas-en-las-sumas)')
    }
  })
})
