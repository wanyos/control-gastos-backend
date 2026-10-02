// THE END-TO-END PROOF that a guardian of the suite can actually stop a run
// (feature 33, second pass, after the review of 2026-08-26).
//
// Testing `failRun` in isolation proves the REPORT works, which was never the
// part that was broken: the run kept exiting 0 while printing the alarm. The only
// way to prove the opposite is to RUN A WHOLE VITEST PASS and look at its exit
// code, so that is what this file does: it writes a tiny throwaway project that
// wires the REAL `failRun`, runs it in a child process, and asserts the code the
// shell would see.
//
// What that project watches is a file of its own, invented, created and deleted
// by this test: since feature 52 nothing of the suite watches a folder of the
// human's disk, and this test needs none to prove what it proves.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const vitestBin = join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')

// Inside `node_modules/` so that `vitest/config` and the repo's own modules
// resolve exactly as they do anywhere else in the tree. It is gitignored, and
// this test deletes it whatever happens.
const harnessParent = join(repoRoot, 'node_modules')

const guardConfig = `import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    root: __dirname,
    include: ['**/*.check.ts'],
    globalSetup: ['./guard.setup.ts'],
    environment: 'node',
  },
})
`

// The same shape the real `vitest.global-setup.ts` has: a photo before, a
// comparison in the teardown, and the REAL `failRun` to fail the pass. The photo
// here is the modification time of one invented file.
const guardSetup = `import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { failRun } from '../../src/lib/test-guard.js'

const watched = fileURLToPath(new URL('./watched/producto-inventado.json', import.meta.url))

export default function setup() {
  const before = statSync(watched).mtimeMs
  return () => {
    const after = statSync(watched).mtimeMs
    failRun(after === before ? [] : ['EL ARCHIVO VIGILADO HA CAMBIADO DE FECHA DURANTE LA PASADA.'])
  }
}
`

const touchingCheck = `import { utimesSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('changes the date of the watched file and nothing else', () => {
  const file = fileURLToPath(new URL('./watched/producto-inventado.json', import.meta.url))
  const later = new Date(Date.now() + 60_000)
  utimesSync(file, later, later)
  expect(1).toBe(1)
})
`

const quietCheck = `import { expect, it } from 'vitest'

it('touches nothing', () => {
  expect(1).toBe(1)
})
`

let harnessDir: string | null = null

function writeHarness(check: string): string {
  harnessDir = mkdtempSync(join(harnessParent, '.guard-e2e-'))
  mkdirSync(join(harnessDir, 'watched'))
  writeFileSync(join(harnessDir, 'watched', 'producto-inventado.json'), '{"name":"inventado"}\n')
  writeFileSync(join(harnessDir, 'guard.config.ts'), guardConfig)
  writeFileSync(join(harnessDir, 'guard.setup.ts'), guardSetup)
  writeFileSync(join(harnessDir, 'probe.check.ts'), check)
  return harnessDir
}

function runHarness(dir: string): { status: number | null; output: string } {
  // The VITEST_* variables of the worker running THIS test would reach the child
  // and make it think it is part of this pass.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')),
  )
  const result = spawnSync(
    process.execPath,
    [vitestBin, 'run', '--config', join(dir, 'guard.config.ts')],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    },
  )
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

afterEach(() => {
  if (harnessDir) rmSync(harnessDir, { recursive: true, force: true })
  harnessDir = null
})

describe('a guardian of the suite stops the pass, and the shell finds out', () => {
  it('EXITS NON-ZERO when a watched file was touched, with all its tests green', () => {
    const { status, output } = runHarness(writeHarness(touchingCheck))

    // The tests themselves pass: what fails the pass is the guardian, which is
    // exactly the case that used to exit 0 (review of feature 33).
    expect(output).toContain('1 passed')
    expect(output).toContain('EL ARCHIVO VIGILADO HA CAMBIADO DE FECHA DURANTE LA PASADA.')
    expect(output).toContain('La pasada se marca como FALLIDA')
    expect(status).not.toBe(0)
  }, 120_000)

  it('EXITS ZERO when nothing was touched: it does not cry wolf', () => {
    const { status, output } = runHarness(writeHarness(quietCheck))

    expect(output).toContain('1 passed')
    expect(output).not.toContain('La pasada se marca como FALLIDA')
    expect(status).toBe(0)
  }, 120_000)
})
