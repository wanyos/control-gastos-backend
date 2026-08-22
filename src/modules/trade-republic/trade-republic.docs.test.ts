// Guardian of the DOCUMENTATION of this bank (R1, R3, R4). It reads `docs/`, not
// code: the template the human copies every month is the deliverable of this
// feature as much as the parser is, and a template that drifts from the parser is
// exactly the failure this file exists to catch.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { tradeRepublicTemplate } from './trade-republic.fixture.js'

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function doc(name: string): string {
  return readFileSync(join(repoRoot, 'docs', name), 'utf8')
}

const productFiles = doc('trade-republic-product-files.md')

/** Every ```json fenced block of a markdown document, in order. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1])
}

describe('docs/trade-republic-product-files.md — the template (R1)', () => {
  it('publishes at least one json block, and it is the template', () => {
    expect(jsonBlocks(productFiles).length).toBeGreaterThan(0)
  })

  it('carries NO copyable value: every value of every json block is a <…> marker', () => {
    for (const block of jsonBlocks(productFiles)) {
      const parsed = JSON.parse(block) as Record<string, unknown>

      for (const [key, value] of Object.entries(parsed)) {
        expect(
          typeof value === 'string' && /^<.*>$/s.test(value),
          `${key} is not a <…> marker: ${JSON.stringify(value)}`,
        ).toBe(true)
      }
    }
  })

  it('publishes the SAME template the parser test copies verbatim', () => {
    // If they drift apart, the R2 test would be proving nothing about the
    // document the human actually copies.
    expect(jsonBlocks(productFiles)[0].trim()).toBe(tradeRepublicTemplate.trim())
  })

  it('names the nine mandatory fields', () => {
    for (const key of [
      'type',
      'name',
      'date',
      'openedAt',
      'openingBalance',
      'moneyIn',
      'moneyOut',
      'interest',
      'balance',
    ]) {
      expect(productFiles).toContain(key)
    }
  })
})

describe('docs/trade-republic-product-files.md — the arithmetic check (R17)', () => {
  it('publishes the formula and says the file is REJECTED, not warned', () => {
    expect(productFiles).toContain('openingBalance + moneyIn − moneyOut + interest = balance')
    expect(productFiles).toContain('saldo inicial + entradas − salidas + intereses = saldo final')
    expect(productFiles).toMatch(/se RECHAZA/)
    expect(productFiles).toContain('No es un aviso')
  })

  it('says one cent is forgiven, and warns that moneyIn excludes the interest', () => {
    expect(productFiles).toContain('1 céntimo')
    expect(productFiles).toContain('`moneyIn` NO incluye los intereses')
  })
})

describe('docs/trade-republic-product-files.md — the half-erased marker (feature 28)', () => {
  it('has its own row in the table of «qué pasa cuando un archivo está mal»', () => {
    expect(productFiles).toContain('a medio sustituir')
    expect(productFiles).toContain('te dejaste un símbolo suelto')
  })

  it('says what counts, what does not, and that nothing gets repaired', () => {
    expect(productFiles).toContain('empieza\n> por `<` o acaba en `>`')
    expect(productFiles).toContain('el símbolo **en medio** de un texto no cuenta')
    expect(productFiles).toContain('no te lo arregla')
  })
})

describe('docs/trade-republic-product-files.md — what it does NOT repeat (R3)', () => {
  it('links to the MyInvestor document instead of copying its writing rules', () => {
    expect(productFiles).toContain('myinvestor-product-files.md')
  })

  it('says the template that is copied lives in Drive, in a folder SIBLING of notas-banco/', () => {
    expect(productFiles).toContain('HERMANA de `notas-banco/`')
  })
})

describe('it is written down that this is provisional (R4)', () => {
  it('the template document says so and links to the diagnosis', () => {
    expect(productFiles).toContain('PROVISIONAL')
    expect(productFiles).toContain('progress/explorations/inventario-bancos-2026-08-17.md')
    // What reverts it, in the document he reads every month.
    expect(productFiles).toContain('movimientos de verdad')
  })

  it('the roadmap says so too, in the stage of the parsers (E4)', () => {
    const roadmap = doc('roadmap.md')

    expect(roadmap).toContain('trade-republic-product-files.md')
    expect(roadmap).toMatch(/Trade Republic[^\n]*provisional/i)
  })

  it('docs/conventions.md admits a bank may enter by hand-written file only', () => {
    expect(doc('conventions.md')).toContain('solo por archivo escrito a mano')
  })
})
