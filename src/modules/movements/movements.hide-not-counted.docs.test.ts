// Checks the CONTRACT of feature 68 `movements-hide-not-counted` (R13). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against. Behaviour is tested in `movements.hide-not-counted.test.ts`.
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

const flat = (text: string) => text.replace(/\s+/g, ' ')

describe('docs/api-contract.md — hideNotCounted in GET /api/movements (feature 68)', () => {
  it('the contract describes hideNotCounted and how to count what it hides', () => {
    const listing = section(contract, '### `GET /api/movements`')
    expect(listing, 'the contract has no section for GET /api/movements').not.toBe('')

    // ── The parameter row ──
    const row = listing.split('\n').find((line) => line.startsWith('| `hideNotCounted` |'))
    expect(row, 'GET /api/movements has no querystring row for hideNotCounted').toBeDefined()
    const parameter = row ?? ''
    expect(parameter).toContain('boolean (`true` / `false`)')
    expect(parameter).toContain('`excludedFromTotals: true`')
    expect(parameter).toContain('`transferId` no nulo')
    // The exception of the deposit movements that add something.
    expect(parameter).toContain('**salvo los movimientos de depósito que suman algo**')
    expect(parameter).toContain('`deposit.countedAmount` distinto de `"0.00"`')
    expect(parameter).toContain('`hideNotCounted=false` **no filtra nada**')
    expect(parameter).toContain('también con `excluded`, `transfer` y `ownership`')
    expect(parameter).toContain('**400 `VALIDATION_ERROR`**')
    expect(parameter).toContain('Los `totals` son los mismos que sin él.')

    // ── Its own subsection: what it hides, the totals, combining, counting ──
    const hiding = flat(section(listing, '#### Esconder lo que no cuenta'))
    expect(hiding, 'GET /api/movements has no «Esconder lo que no cuenta» part').not.toBe('')
    expect(hiding).toContain('**Sale** todo movimiento de depósito que suma algo')
    expect(hiding).toContain(
      'vencimiento dudoso, apertura, cancelación, o vencimiento con interés exactamente `0`',
    )
    expect(hiding).toContain('**Los `totals` son los mismos que sin el parámetro**')
    expect(hiding).toContain('también con `excluded`, `transfer` y `ownership`, sin error')
    expect(hiding).toContain('**la misma petición sin `hideNotCounted`**')
    expect(hiding).toContain('**restan los dos `pagination.total`**')

    // ── The note of `totals` and the 400 row of the errors table ──
    expect(flat(listing)).toContain(
      'con `hideNotCounted=true` los `totals` son los mismos que sin él',
    )
    const errorRow = listing.split('\n').find((line) => line.startsWith('| 400 '))
    expect(errorRow).toContain(
      '**desde la feature 68** `hideNotCounted` con un valor que no es `true` ni `false`',
    )
  })
})
