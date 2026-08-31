// Test-only guard over `var/` (feature 33).
//
// `var/` is where the downloads of his banks live (`var/drive-read/`) and where
// the parser writes what it makes of them (`var/parsed/`). It is gitignored, so
// it is the ONE thing in this repository with no copy anywhere: a test that
// writes there overwrites data that cannot be recovered.
//
// It happened: a test asserted the Trade Republic route by INVOKING it on the
// real app, which falls back to `var/`, so every suite run parsed his real files
// and rewrote his dump. On a fresh machine `var/` does not exist and it was
// invisible; on his machine it was not.
//
// So the promise stops depending on anybody remembering it, exactly as feature
// 27 did with his database: a photo of `var/` before the suite and another one
// after, and any difference -- content, size or modification time -- puts the
// run in RED naming the files.
//
// Deliberately blind to WHAT the files say: it compares hashes, and its messages
// carry paths only. Printing a line of his data to complain about his data being
// touched is the mistake feature 23 already fixed in the other guardian.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One entry per file: what it says, how much it weighs and when it was touched. */
export interface VarFileState {
  hash: string
  size: number
  modifiedAt: number
}

export interface VarSnapshot {
  root: string
  files: Record<string, VarFileState>
}

/** `var/` of this repository. Absent on a fresh machine, and that is not an error. */
export function defaultVarRoot(): string {
  return fileURLToPath(new URL('../../var', import.meta.url))
}

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? allFiles(full) : [full]
  })
}

/**
 * Read-only photo of `var/`. It opens his files to hash them and writes nothing:
 * reading does not change a modification time.
 *
 * A missing `var/` gives an empty snapshot instead of throwing -- that is the
 * state of every machine that is not his, and comparing empty with empty is the
 * right answer there, not an excuse to skip the check.
 */
export function snapshotVarDir(root: string = defaultVarRoot()): VarSnapshot {
  const files: Record<string, VarFileState> = {}
  if (!existsSync(root)) return { root, files }
  for (const file of allFiles(root)) {
    const stats = statSync(file)
    files[relative(root, file).split(sep).join('/')] = {
      hash: createHash('sha256').update(readFileSync(file)).digest('hex'),
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    }
  }
  return { root, files }
}

/**
 * What changed between the two photos, in words and WITHOUT a single byte of his
 * data: the path, and which of the three things moved.
 *
 * The modification time counts as a difference on its own. A test that rewrites
 * a dump byte for byte has still written where it must not, and the day the dump
 * changes for real that timestamp is the only trace left of who did it.
 */
export function describeVarDifferences(before: VarSnapshot, after: VarSnapshot): string[] {
  const differences: string[] = []
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort()
  for (const path of paths) {
    const stateBefore = before.files[path]
    const stateAfter = after.files[path]
    if (stateBefore === undefined) {
      differences.push(`var/${path}: creado por la suite`)
    } else if (stateAfter === undefined) {
      differences.push(`var/${path}: BORRADO por la suite`)
    } else if (stateBefore.hash !== stateAfter.hash) {
      differences.push(
        `var/${path}: su contenido ha cambiado (${stateBefore.size} → ${stateAfter.size} bytes)`,
      )
    } else if (stateBefore.modifiedAt !== stateAfter.modifiedAt) {
      differences.push(`var/${path}: reescrito con el mismo contenido (cambió su fecha)`)
    }
  }
  return differences
}
