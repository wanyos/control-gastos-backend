import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { LocalCopyNotFoundError, ValidationError } from '../../errors/app-error.js'
import { normalizeBankName } from '../../lib/drive-structure.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type { ProductParserRegistry } from '../investments/investments.types.js'
import {
  importProductFile,
  importStatement,
  selectAdapter,
  selectProductAdapter,
  totals,
} from './import.service.js'
import type { BankParserRegistry, LocalFileReport, LocalImportRunResult } from './import.types.js'

/**
 * Which local copies to reimport. Every part is optional and narrows the walk:
 * nothing means "every copy on disk", and each part given must EXIST or the run
 * fails by name (feature 25). The file is identified by its path -- bank folder,
 * year, file name -- because there is no id on disk and the name alone is not
 * unique between banks or years.
 */
export interface LocalImportSelection {
  bank?: string
  year?: string
  name?: string
}

export interface ImportLocalDeps {
  prisma: AppPrismaClient
  /** Base directory of the raw copies; `var/drive-read/` in production. */
  rawCopyBaseDir: string
  parsers: BankParserRegistry
  /**
   * SECOND registry (feature 26): the parsers of PRODUCT files. Optional, so a
   * caller that predates feature 26 behaves exactly as it did.
   */
  productParsers?: ProductParserRegistry
  selection: LocalImportSelection
}

/** One copy found on disk, before anything is read from it. */
interface LocalCandidate {
  /**
   * Folder name exactly as it is on disk, capitals included, kept for the
   * report. The parser is chosen by its slug, never by this.
   */
  bank: string
  bankSlug: string
  year: string
  name: string
  path: string
}

/** Where the copies live, for a message that sends the human to the right place. */
const localCopyHint =
  'la copia local vive en var/drive-read/<banco>/<año>/ y solo existe si ese archivo ' +
  'se descargó alguna vez en esta máquina (POST /api/ingestion/process o POST /api/import).'

/**
 * Reimports movements from the LOCAL copies of `var/drive-read/`, with no Drive
 * client at all (feature 25).
 *
 * Why this exists: until now `procesados/` was a one-way door. A file that got
 * there without its movements being stored -- which is what happened in August
 * 2026, when the ingestion route moved files before the database even existed --
 * could not be seen by the importer ever again, because the pending list only
 * looks at the direct children of the year folder. The raw copy is the same
 * content that was downloaded, so it is enough to import from, and importing
 * from it touches nothing in Drive: nothing is moved, nothing is deleted and no
 * request is made.
 *
 * It is safe to run as many times as needed: the duplicates are dropped by the
 * partial unique index `Movement_imported_dedup_key` (ADR-015, decision 3), the
 * very same one the Drive way in relies on.
 */
export async function importLocalCopies(deps: ImportLocalDeps): Promise<LocalImportRunResult> {
  const candidates = await findCandidates(deps.rawCopyBaseDir, deps.selection)
  const productParsers = deps.productParsers ?? []
  const files: LocalFileReport[] = []

  for (const candidate of candidates) {
    const adapter = selectAdapter(deps.parsers, candidate.bankSlug, candidate.name)
    const location = { bank: candidate.bank, year: candidate.year, name: candidate.name }

    if (!('reason' in adapter)) {
      const stored = await importStatement({
        prisma: deps.prisma,
        adapter: adapter.adapter,
        bankSlug: candidate.bankSlug,
        content: await readFile(candidate.path),
      })
      files.push({ ...location, ...stored, movedToProcessed: false })
      continue
    }

    // Same bifurcation as the Drive way in, and in the same order (feature 26).
    // This is THE way to upload the same month again once its file already
    // reached `procesados/`, which is what makes the promise of R6 usable.
    const productAdapter = selectProductAdapter(productParsers, candidate.bankSlug, candidate.name)

    if (!('reason' in productAdapter)) {
      const stored = await importProductFile({
        prisma: deps.prisma,
        adapter: productAdapter.adapter,
        bankSlug: candidate.bankSlug,
        fileName: candidate.name,
        content: await readFile(candidate.path),
      })
      files.push({ ...location, ...stored, movedToProcessed: false })
      continue
    }

    files.push({
      ...location,
      status: 'skipped',
      reason: adapter.reason,
      movedToProcessed: false,
    })
  }

  return { ...totals(files), files }
}

/**
 * Every copy that matches the selection, in the order of the folders and names.
 *
 * It NEVER returns an empty list: when what was asked for is not on disk it
 * throws `LOCAL_COPY_NOT_FOUND` naming the thing that is missing (the bank, the
 * year or the file) and saying which ones there are. Answering "0 files
 * imported, everything fine" to a file that is not there is the mistake feature
 * 22 already paid for: a message that sends you to look in the wrong place
 * costs a whole round.
 */
async function findCandidates(
  baseDir: string,
  selection: LocalImportSelection,
): Promise<LocalCandidate[]> {
  const wantedBank = selection.bank === undefined ? null : normalizeBankName(selection.bank)
  const wantedYear = selection.year === undefined ? null : plainSegment(selection.year, 'year')
  const wantedName = selection.name === undefined ? null : plainSegment(selection.name, 'name')

  const bankDirs = await subdirectories(baseDir)
  if (bankDirs.length === 0) {
    throw new LocalCopyNotFoundError(`no hay ninguna copia local todavía: ${localCopyHint}`)
  }

  const banks =
    wantedBank === null ? bankDirs : bankDirs.filter((dir) => normalizeBankName(dir) === wantedBank)
  if (banks.length === 0) {
    throw new LocalCopyNotFoundError(
      `no hay copia local del banco '${wantedBank}'. Con copia local hay: ` +
        `${bankDirs.map((dir) => normalizeBankName(dir)).join(', ')}. ${localCopyHint}`,
    )
  }

  const candidates: LocalCandidate[] = []
  const yearsSeen: string[] = []
  const namesSeen: string[] = []

  for (const bank of banks) {
    for (const year of await subdirectories(join(baseDir, bank))) {
      yearsSeen.push(year)
      if (wantedYear !== null && year !== wantedYear) {
        continue
      }
      for (const name of await filesOf(join(baseDir, bank, year))) {
        namesSeen.push(name)
        if (wantedName !== null && name !== wantedName) {
          continue
        }
        candidates.push({
          bank,
          bankSlug: normalizeBankName(bank),
          year,
          name,
          path: join(baseDir, bank, year, name),
        })
      }
    }
  }

  if (candidates.length === 0) {
    throw new LocalCopyNotFoundError(
      await missingCopyMessage(baseDir, bankDirs, selection, yearsSeen, namesSeen),
    )
  }
  return candidates
}

/**
 * Names the most specific thing that was asked for and is not on disk.
 *
 * EVERY branch names what was asked -- the bank one included. A bank whose
 * folder is there but holds no copy used to fall into the generic sentence
 * ("there is no local copy yet"), which is FALSE when other banks do have
 * copies and is exactly the "there was nothing to import" the criterion of this
 * feature forbids.
 */
async function missingCopyMessage(
  baseDir: string,
  bankDirs: string[],
  selection: LocalImportSelection,
  yearsSeen: string[],
  namesSeen: string[],
): Promise<string> {
  const where = describeSelection(selection)

  if (selection.name !== undefined) {
    const available =
      namesSeen.length === 0
        ? 'ahí no hay ningún archivo'
        : `ahí hay: ${unique(namesSeen).join(', ')}`
    return `no hay copia local del archivo '${selection.name}'${where}: ${available}. ${localCopyHint}`
  }
  if (selection.year !== undefined) {
    const available =
      yearsSeen.length === 0
        ? 'no hay ningún año con copia local'
        : `con copia local hay: ${unique(yearsSeen).join(', ')}`
    return `no hay copia local del año '${selection.year}'${where}: ${available}. ${localCopyHint}`
  }
  if (selection.bank !== undefined) {
    const withCopies = await banksWithCopies(baseDir, bankDirs)
    const elsewhere =
      withCopies.length === 0
        ? 'y no hay copia local de ningún banco'
        : `y sí las tienen: ${withCopies.join(', ')}`
    return (
      `la carpeta del banco '${normalizeBankName(selection.bank)}' está en las copias ` +
      `locales pero no tiene ninguna copia dentro, ${elsewhere}. ${localCopyHint}`
    )
  }
  return `no hay ninguna copia local todavía: ${localCopyHint}`
}

/** Slugs of the bank folders that really hold at least one copy, sorted. */
async function banksWithCopies(baseDir: string, bankDirs: string[]): Promise<string[]> {
  const withCopies: string[] = []

  for (const bank of bankDirs) {
    for (const year of await subdirectories(join(baseDir, bank))) {
      if ((await filesOf(join(baseDir, bank, year))).length > 0) {
        withCopies.push(normalizeBankName(bank))
        break
      }
    }
  }
  return unique(withCopies).sort((left, right) => left.localeCompare(right))
}

/** ` de <banco>/<año>`, with whatever part of the two was actually asked for. */
function describeSelection(selection: LocalImportSelection): string {
  const parts = [selection.bank, selection.year].filter(
    (part): part is string => part !== undefined,
  )
  return parts.length === 0 ? '' : ` en ${parts.join('/')}`
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * A single path segment: no separator, no `..`, no empty string. The route
 * validates it too, but this is the function that reaches the filesystem and it
 * is exported code, so it checks for itself instead of trusting its caller.
 */
function plainSegment(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed === '..' || /[/\\]/.test(trimmed)) {
    throw new ValidationError(`${field} must be a single name, with no path separator`)
  }
  return trimmed
}

/** Subfolder names, sorted; a directory that is not there reads as empty. */
async function subdirectories(dir: string): Promise<string[]> {
  return entriesOf(dir, (entry) => entry.isDirectory())
}

/** File names, sorted; a directory that is not there reads as empty. */
async function filesOf(dir: string): Promise<string[]> {
  return entriesOf(dir, (entry) => entry.isFile())
}

async function entriesOf(
  dir: string,
  keep: (entry: { isDirectory(): boolean; isFile(): boolean }) => boolean,
): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter(keep)
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch {
    // A missing (or unreadable) directory is "no copy here", never a crash: the
    // caller turns it into LOCAL_COPY_NOT_FOUND with the name of what is missing.
    return []
  }
}
