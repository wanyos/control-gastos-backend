// R15 of feature 55: the step-by-step document for the human exists and covers
// the two commands. It reads docs/database-backup.md; it runs nothing.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const moduleDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const documentPath = join(moduleDir, '../../../docs/database-backup.md')

const sections = [
  '## 1. Preparar la carpeta',
  '## 2. Hacer una copia',
  '## 3. Ver las copias que hay',
  '## 4. Restaurar en una base nueva',
  '## 5. Restaurar sobre la base de verdad',
]

/** Text of each numbered section, from its heading to the next `## ` heading. */
function sectionBodies(document: string): Map<string, string> {
  const lines = document.split(/\r?\n/)
  const bodies = new Map<string, string>()
  for (const heading of sections) {
    const start = lines.indexOf(heading)
    if (start === -1) continue
    const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
    bodies.set(heading, lines.slice(start + 1, next === -1 ? undefined : next).join('\n'))
  }
  return bodies
}

describe('docs/database-backup.md', () => {
  it('documents step by step how to make a copy and how to restore it', () => {
    expect(existsSync(documentPath)).toBe(true)
    const document = readFileSync(documentPath, 'utf8')
    const lines = document.split(/\r?\n/)

    for (const text of [
      'pnpm run db:backup',
      'pnpm run db:restore',
      'GOOGLE_DRIVE_BACKUP_FOLDER_ID',
      'backup-control-gastos',
      '_before_restore_',
    ]) {
      expect(document, text).toContain(text)
    }

    // The five sections, each once and in this order.
    const positions = sections.map((heading) => lines.indexOf(heading))
    expect(positions.every((position) => position !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    for (const heading of sections) {
      expect(lines.filter((line) => line === heading)).toHaveLength(1)
    }

    // Each section carries what the human has to type in that step.
    const bodies = sectionBodies(document)
    const [prepare, backup, list, restoreNew, restoreReal] = sections.map(
      (heading) => bodies.get(heading) ?? '',
    )
    expect(prepare).toContain('GOOGLE_DRIVE_BACKUP_FOLDER_ID=')
    expect(prepare).toContain('notas-banco/')
    expect(prepare).toContain('https://drive.google.com/drive/folders/')
    expect(backup).toContain('pnpm run db:backup')
    expect(list).toMatch(/^pnpm run db:restore$/m)
    expect(restoreNew).toMatch(/^pnpm run db:restore \S+\.dump gastos_restore_check$/m)
    expect(restoreNew).toContain('dropdb -U postgres gastos_restore_check')
    expect(restoreReal).toMatch(/^\s*pnpm run db:restore \S+\.dump gastos$/m)
    expect(restoreReal).toContain('_before_restore_')
    expect(restoreReal).toContain('pnpm run dev')

    // The two notes: what the copy leaves out, and who deletes old copies.
    expect(document).toContain('.env')
    expect(document).toContain('se borran a mano')
    expect(document).toContain('Docker')
  })
})
