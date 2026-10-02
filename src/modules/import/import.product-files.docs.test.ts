// Reads DOCUMENTS, not code (feature 53, R13..R15): the rejection of the second
// product file of one import with the same bank, name and date exists for the
// frontend and for the human only if the contract and the two product-file
// documents say so. The behaviour itself is tested in `import.service.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function doc(name: string): string {
  return readFileSync(join(repoRoot, 'docs', name), 'utf8')
}

/** Every run of whitespace folded, so a line wrap cannot hide a phrase. */
function folded(text: string): string {
  return text.replace(/\s+/g, ' ')
}

const errorCode = 'DUPLICATE_PRODUCT_FILE'

/** From a heading to the next heading of the same or a higher level. */
function sectionOf(markdown: string, heading: string, nextHeading: RegExp): string {
  const start = markdown.indexOf(`\n${heading}\n`)
  if (start === -1) return ''
  const rest = markdown.slice(start + 1 + heading.length)
  const end = rest.search(nextHeading)
  return end === -1 ? rest : rest.slice(0, end)
}

/** The row of the loose-ends table whose first cell is that number, struck through or not. */
function looseEndRow(roadmap: string, number: number): string {
  const row = roadmap
    .split(/\r?\n/)
    .find((line) => line.startsWith(`| ${number} |`) || line.startsWith(`| ~~${number}~~ |`))
  return row ?? ''
}

describe('the documents describe the rejection of feature 53', () => {
  it('api-contract: describes the rejection of the second product file of one import', () => {
    const section = sectionOf(doc('api-contract.md'), '### `POST /api/import`', /\n## /)
    expect(section, 'the contract has no `POST /api/import` section').not.toBe('')

    const codesTable = section.slice(
      section.indexOf('**Códigos que aparecen por archivo (dentro del 200)**'),
    )
    expect(codesTable).toMatch(new RegExp(`^\\| \`${errorCode}\` \\|`, 'm'))

    const productFiles = folded(
      sectionOf(section, '#### Archivos de producto (features 26 y 29)', /\n#### |\n### /),
    )
    expect(productFiles).toContain(errorCode)
    expect(productFiles).toContain('**no se guarda nada** de él')
    expect(productFiles).toContain('**no se mueve a `procesados/`**')
    expect(productFiles).toContain('**Solo compara archivos de una misma llamada.**')
  })

  it('product-file documents: say the second file is rejected, not that nobody warns', () => {
    for (const name of ['myinvestor-product-files.md', 'trade-republic-product-files.md']) {
      const text = folded(doc(name))
      expect(text, `${name} does not name the code`).toContain(errorCode)
      expect(text, name).toContain('**el segundo se rechaza**')
      expect(text.toLowerCase(), `${name} still says nobody warns`).not.toContain('nadie te avisa')
    }
  })

  it('roadmap: closes loose end 21 with feature 53 and leaves 24 open', () => {
    const roadmap = doc('roadmap.md')

    const closed = looseEndRow(roadmap, 21)
    expect(closed.startsWith('| ~~21~~ | ~~')).toBe(true)
    expect(closed).toContain('cerrado por la F53')

    const open = looseEndRow(roadmap, 24)
    expect(open.startsWith('| 24 | ')).toBe(true)
    expect(open).not.toContain('~~')
    expect(open).toContain('**sin abrir**')
  })
})
