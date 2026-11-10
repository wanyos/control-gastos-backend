// Checks the CONTRACT of feature 71 `myinvestor-investment-purchases` (R14). It
// reads `docs/api-contract.md`, not code: that document is what the frontend
// builds against, so a field or a rule that lives only in the code does not
// exist for whoever consumes the API. Behaviour is tested in
// `movements.investment-purchases.test.ts` and `myinvestor.investment-purchase.test.ts`.
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
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`)
  if (start === -1) return ''
  const level = /^#+/.exec(heading)?.[0].length ?? 3
  const rest = text.slice(start + 1 + heading.length)
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

// The closed list of fixed MyInvestor concepts that are not a purchase
// (requirements.md §Vocabulario, R1). A literal list on purpose: what this file
// checks is the document, not the constant of the code.
const knownNonPurchasePrefixes = [
  'SUSCRIPCION PREMIUM',
  'IVA SUSCRIPCION PREMIUM',
  'RET. REMUNERACION PREMIUM',
  'APERTURA DEP',
  'APORTACION AUTOMATICA CARTERA',
  'APORTACION A MI CARTERA',
]

describe('docs/api-contract.md — MyInvestor investment purchases in the sums (feature 71)', () => {
  it('api-contract: describes the investmentPurchase field and the rule of MyInvestor investment purchases in the sums', () => {
    // ── GET /api/movements: the field in the response example and its key ──
    const listing = section(contract, '### `GET /api/movements`')
    expect(listing, 'the contract has no section for GET /api/movements').not.toBe('')

    const [responseExample] = jsonBlocks(listing)
    const response = JSON.parse(responseExample ?? '') as {
      movements: Record<string, unknown>[]
    }
    expect(response.movements.length).toBeGreaterThan(0)
    for (const movement of response.movements) {
      expect(movement, 'the response example carries no `investmentPurchase`').toHaveProperty(
        'investmentPurchase',
      )
    }

    expect(listing, 'the contract has no row for `investmentPurchase.certain`').toMatch(
      /^\s*\| `certain` \| boolean \| .+\|$/m,
    )
    const examples = jsonBlocks(listing).map((block) => {
      try {
        return JSON.parse(block) as unknown
      } catch {
        return null
      }
    })
    expect(examples, 'no example of a purchase with `certain: true`').toContainEqual({
      certain: true,
    })
    expect(examples, 'no example of a purchase with `certain: false`').toContainEqual({
      certain: false,
    })

    // ── Its own subsection: the closed list, the rule of `certain`, the order ──
    const rule = section(listing, '#### Compras de inversión de MyInvestor en las sumas')
    expect(rule, 'GET /api/movements has no «Compras de inversión…» part').not.toBe('')
    for (const prefix of knownNonPurchasePrefixes) {
      expect(rule, `the closed list does not name \`${prefix}\``).toMatch(
        new RegExp(`^\\s*\\| \`${prefix.replace(/\./g, '\\.')}\` \\| .+\\|$`, 'm'),
      )
    }
    const flatRule = flat(rule)
    expect(flatRule).toContain('**no empieza por ninguno de los conceptos fijos del banco**')
    expect(flatRule).toContain('**también la de un producto que la aplicación no conoce**')
    expect(flatRule).toContain('`true` si el concepto acaba en `@`')
    expect(flatRule).toContain('**Qué suma una compra:** nada, ni en `income` ni en `expense`')
    expect(flatRule).toContain('**Orden en que se aplican las reglas a un movimiento:**')
    expect(flatRule).toContain('**No escribe en ningún movimiento**')

    // ── The three sums point to the rule ──
    const anchor = '(#compras-de-inversión-de-myinvestor-en-las-sumas)'
    const overview = section(contract, '### `GET /api/overview`')
    expect(overview, 'GET /api/overview does not point to the purchase rule').toContain(anchor)
    const byCategory = section(contract, '### `GET /api/expenses-by-category`')
    expect(
      byCategory,
      'GET /api/expenses-by-category does not point to the purchase rule',
    ).toContain(anchor)
  })
})
