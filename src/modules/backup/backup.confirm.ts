// The only way to confirm a restore over a database that has tables (feature
// 55): its name, typed on a terminal. No argument and no variable replaces it.
import { createInterface } from 'node:readline'

/**
 * Returns the line typed, or null -- having written nothing -- when the input
 * is not a terminal (a test, an agent, a pipe) or it closes without a line.
 */
export async function askDatabaseName(
  input: NodeJS.ReadableStream & { isTTY?: boolean },
  output: NodeJS.WritableStream,
  database: string,
  keptAs: string,
): Promise<string | null> {
  if (input.isTTY !== true) return null

  output.write(
    `La base «${database}» ya tiene tablas. Si sigues, su contenido se sustituye por el de la copia ` +
      `y lo que hay ahora se conserva entero en la base «${keptAs}».\n` +
      `Para seguir, escribe el nombre de la base (${database}) y pulsa Intro. Cualquier otra cosa cancela: `,
  )

  const lines = createInterface({ input, terminal: false })
  return new Promise<string | null>((resolve) => {
    let typed: string | null = null
    lines.once('line', (line) => {
      typed = line
      lines.close()
    })
    lines.once('close', () => resolve(typed))
  })
}
