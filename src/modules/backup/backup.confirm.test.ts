import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { askDatabaseName } from './backup.confirm.js'

function streams(isTTY: boolean | undefined) {
  const input: PassThrough & { isTTY?: boolean } = new PassThrough()
  if (isTTY !== undefined) input.isTTY = isTTY
  const output = new PassThrough()
  const written: Buffer[] = []
  output.on('data', (chunk: Buffer) => written.push(chunk))
  return { input, output, written: () => Buffer.concat(written).toString('latin1') }
}

const database = 'gastos_demo'
const keptAs = 'gastos_demo_before_restore_20260314090507'

describe('askDatabaseName', () => {
  it('refuses to ask when the input is not a terminal', async () => {
    for (const isTTY of [undefined, false]) {
      const { input, output, written } = streams(isTTY)
      // Even with the right name already waiting in the input.
      input.write(`${database}\n`)

      const typed = await askDatabaseName(input, output, database, keptAs)

      expect(typed).toBeNull()
      expect(written()).toBe('')
    }
  })

  it('returns what was typed on a terminal', async () => {
    const { input, output, written } = streams(true)

    const pending = askDatabaseName(input, output, database, keptAs)
    input.write(`${database}\n`)

    expect(await pending).toBe(database)
    expect(written()).toContain(database)
    expect(written()).toContain(keptAs)
  })

  it('returns the line as typed, spaces included, so that only the exact name confirms', async () => {
    const { input, output } = streams(true)

    const pending = askDatabaseName(input, output, database, keptAs)
    input.write(` ${database} \r\n`)

    expect(await pending).toBe(` ${database} `)
  })

  it('returns null when the terminal closes without a line', async () => {
    const { input, output } = streams(true)

    const pending = askDatabaseName(input, output, database, keptAs)
    input.end()

    expect(await pending).toBeNull()
  })
})
