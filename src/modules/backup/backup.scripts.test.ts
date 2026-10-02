// Runs the two scripts of `scripts/` as the human does, but in a way that can
// reach nothing of his: the working directory is the temporary folder of the
// system (so no `.env` of the repository is loaded), every variable is invented
// and the folder variable is one `loadConfig` rejects, so each script ends
// before it builds a Drive client or runs anything in the container.
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const tsxCli = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url))

const inventedEnv = {
  DATABASE_URL: 'postgresql://nadie:nada@localhost:5434/gastos_test_no_existe',
  GOOGLE_DRIVE_CLIENT_ID: 'invented-client-id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'invented-client-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'invented-refresh-token',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: 'invented-root-folder',
  // A folder name with spaces where the id should be.
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: 'copias de prueba',
}

interface ScriptRun {
  exitCode: number | null
  stdout: string
  stderr: string
}

function runScript(script: string, args: string[] = []): Promise<ScriptRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, `${repoRoot}/scripts/${script}`, ...args], {
      cwd: tmpdir(),
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...inventedEnv },
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (exitCode) =>
      resolve({
        exitCode,
        stdout: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)),
        stderr: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stderr)),
      }),
    )
  })
}

const configurationProblem = [
  'Invalid environment configuration:',
  "- GOOGLE_DRIVE_BACKUP_FOLDER_ID must be a bare Drive folder id or a folder URL (not the folder name), got 'copias de prueba'; remove the line if the backup commands are not used",
]

describe('backup scripts with a badly written .env', { timeout: 60_000 }, () => {
  it('db:backup says the copy is NOT made before the configuration problem', async () => {
    const run = await runScript('db-backup.ts')

    expect(run.exitCode).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr.trimEnd().split(/\r?\n/)).toEqual([
      'La copia NO está hecha.',
      ...configurationProblem,
    ])
  })

  it('db:restore prints the configuration problem alone and restores nothing', async () => {
    for (const args of [[], ['control-gastos-2026-03-14-090507.dump', 'gastos_test_no_existe']]) {
      const run = await runScript('db-restore.ts', args)

      expect(run.exitCode).toBe(1)
      expect(run.stdout).toBe('')
      expect(run.stderr.trimEnd().split(/\r?\n/)).toEqual(configurationProblem)
    }
  })
})
