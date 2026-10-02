// Guardian of the CONTRACT of the two routes of feature 48 (R15). It reads
// `docs/api-contract.md`, not code: that document is what the frontend builds
// against, so a route or a field that lives only in the code and not there does
// not exist for whoever consumes the API.
//
// It does not re-test behaviour (that is `import.warnings.routes.test.ts`): it
// checks that the document NAMES the two routes and every field of the two
// lists, and that the example it publishes carries exactly those fields.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const contract = readFileSync(join(repoRoot, 'docs', 'api-contract.md'), 'utf8')

const sectionHeading = '## Lo que una importación deja sin resolver'

/** The section of this feature: from its heading to the next `## ` heading. */
const section = (() => {
  const start = contract.indexOf(sectionHeading)
  if (start === -1) return ''
  const rest = contract.slice(start + 3)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
})()

/** Every ```json fenced block of a markdown text, in order. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1])
}

// The same names the backend serializes (`import.warnings.types.ts`). Kept as a
// literal list on purpose: a type is erased at runtime, and what this file
// guards is the DOCUMENT, so the list has to be written down somewhere the
// document can be checked against.
const unparsedRowFields = [
  'id',
  'file',
  'row',
  'reason',
  'status',
  'note',
  'reviewedAt',
  'detectedAt',
]
const balanceMismatchFields = [
  'id',
  'file',
  'accountId',
  'accountAlias',
  'date',
  'computed',
  'fromFile',
  'difference',
  'check',
  'status',
  'note',
  'detectedAt',
  'lastSeenAt',
]

describe('docs/api-contract.md — the two routes of feature 48 (R15)', () => {
  it('has a section of its own for what an import leaves unresolved', () => {
    expect(section, 'the contract has no section for feature 48').not.toBe('')
  })

  it('names the listing route and the review route', () => {
    expect(section).toContain('GET /api/import/warnings')
    expect(section).toContain('PATCH /api/import/warnings/balance-mismatches/:id')
  })

  it('names the two lists and their counters', () => {
    expect(section).toContain('unparsedRows')
    expect(section).toContain('balanceMismatches')
    expect(section).toContain('counts')
  })

  it('describes every field of an unreadable row', () => {
    for (const field of unparsedRowFields) {
      expect(section, `the contract does not name \`${field}\``).toContain(`\`${field}\``)
    }
  })

  it('describes every field of a stored descuadre', () => {
    for (const field of balanceMismatchFields) {
      expect(section, `the contract does not name \`${field}\``).toContain(`\`${field}\``)
    }
  })

  it('publishes an example answer with EXACTLY those fields', () => {
    const [example] = jsonBlocks(section)
    expect(example, 'the section publishes no json example').toBeDefined()

    const parsed = JSON.parse(example) as {
      unparsedRows: Record<string, unknown>[]
      balanceMismatches: Record<string, unknown>[]
      counts: Record<string, unknown>
    }

    expect(Object.keys(parsed)).toEqual(['unparsedRows', 'balanceMismatches', 'counts'])
    expect(Object.keys(parsed.unparsedRows[0])).toEqual(unparsedRowFields)
    expect(Object.keys(parsed.balanceMismatches[0])).toEqual(balanceMismatchFields)
    expect(Object.keys(parsed.counts)).toEqual(['unparsedRows', 'balanceMismatches'])
    // `file` is the origin of the warning, with the three data of the folder.
    expect(Object.keys(parsed.unparsedRows[0].file as object)).toEqual(['bank', 'year', 'name'])
  })

  it('says the two values of `check` and the two of `status`', () => {
    expect(section).toContain('"per-line"')
    expect(section).toContain('"statement-balance"')
    expect(section).toContain('"pending"')
    expect(section).toContain('"reviewed"')
  })

  it('says the listing does NOT paginate', () => {
    expect(section).toContain('**No pagina.**')
  })

  it('publishes the two errors of the review route and no new error code', () => {
    expect(section).toContain('VALIDATION_ERROR')
    expect(section).toContain('NOT_FOUND')
    expect(section).toContain('Ningún código de error nuevo')
  })

  it('says a reviewed descuadre stops being listed and is the human who closes it', () => {
    expect(section).toContain('no aparece aquí ni cuenta en `counts`')
    expect(section.replace(/\s+/g, ' ')).toContain('el sistema **nunca** lo quita solo')
  })
})

// Feature 54 `unparsed-row-review`: the three documents that describe it.
describe('the documents of feature 54 (R13, R14, R15)', () => {
  const readDoc = (name: string) => readFileSync(join(repoRoot, 'docs', name), 'utf8')

  it('api-contract: names the route that reviews an unreadable row and its fields', () => {
    const route = 'PATCH /api/import/warnings/unparsed-rows/:id'
    expect(section).toContain(`### \`${route}\``)
    for (const field of ['status', 'note', 'reviewedAt']) {
      expect(section, `the contract does not name \`${field}\``).toContain(`\`${field}\``)
    }
    // The old sentence said an unreadable row could not be reviewed at all.
    expect(section).not.toContain('no tienen estado')
    expect(section).not.toContain('no tiene estado')

    // The subsection of the route: params, body, answer and its two errors.
    const subsection = section.slice(section.indexOf(`### \`${route}\``))
    for (const part of ['**Params**', '**Body**', '**Respuesta 200**', '**Errores**']) {
      expect(subsection, `the route has no ${part}`).toContain(part)
    }
    expect(subsection).toContain('VALIDATION_ERROR')
    expect(subsection).toContain('NOT_FOUND')
    const [answer] = jsonBlocks(subsection)
    expect(Object.keys(JSON.parse(answer) as object)).toEqual(unparsedRowFields)

    // The counter no longer is the size of the list.
    const flat = section.replace(/\s+/g, ' ')
    expect(flat).toContain('`counts.unparsedRows` es el número de elementos de `unparsedRows` con')
    expect(flat).toContain('**No es el tamaño de la lista**')
  })

  it('data-model: describes ImportUnparsedRow with its review columns', () => {
    const dataModel = readDoc('data-model.md')
    const start = dataModel.indexOf('model ImportUnparsedRow {')
    expect(start, 'data-model.md has no `model ImportUnparsedRow`').toBeGreaterThan(-1)
    const block = dataModel.slice(start, dataModel.indexOf('\n}', start))

    expect(block).toMatch(/^\s+status\s+ImportWarningStatus\s+@default\(pending\)/m)
    expect(block).toMatch(/^\s+note\s+String\?/m)
    expect(block).toMatch(/^\s+reviewedAt\s+DateTime\?/m)
    expect(block).toContain('ImportUnparsedRow_identity_key')
    // The other table of feature 48 and the enumeration they share.
    expect(dataModel).toContain('model ImportBalanceMismatch {')
    expect(dataModel).toContain('enum ImportWarningStatus {')
    expect(dataModel).toContain('ImportBalanceMismatch_identity_key')
    // Both are in the entity diagram.
    expect(dataModel).toContain('IMPORT_UNPARSED_ROW {')
    expect(dataModel).toContain('ACCOUNT ||--o{ IMPORT_BALANCE_MISMATCH')
  })

  it('data-model: declares for ImportUnparsedRow the same columns as prisma/schema.prisma', () => {
    const columnsOf = (text: string) => {
      const start = text.indexOf('model ImportUnparsedRow {')
      const block = text.slice(start, text.indexOf('\n}', start))
      return [...block.matchAll(/^\s+(\w+)\s+(Int|String\??|DateTime\??|ImportWarningStatus)\s/gm)]
        .map((match) => `${match[1]} ${match[2]}`)
        .sort()
    }
    const schema = readFileSync(join(repoRoot, 'prisma', 'schema.prisma'), 'utf8')

    expect(columnsOf(schema)).toHaveLength(11)
    expect(columnsOf(readDoc('data-model.md'))).toEqual(columnsOf(schema))
  })

  it('roadmap: closes loose end 23 with feature 54 and says creating the movement by hand was discarded', () => {
    const row = readDoc('roadmap.md')
      .split(/\r?\n/)
      .find((line) => /^\|\s*~*23~*\s*\|/.test(line))

    expect(row, 'the roadmap has no row 23 in its table of loose ends').toBeDefined()
    expect(row).toMatch(/^\|\s*~~23~~\s*\|\s*~~.*~~\s*\|/)
    expect(row).toContain('F54')
    expect(row).toContain('descartado')
  })
})
