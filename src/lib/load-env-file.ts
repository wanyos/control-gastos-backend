// Loads the `.env` of the current working directory into the environment of
// the process, with Node's own `process.loadEnvFile()` (stable since Node 24.10).
//
// Imported for its effect, as the FIRST import of every entry point that needs
// the `.env` (src/server.ts, prisma.config.ts, the seeds, vitest.global-setup.ts)
// and as the first of the `setupFiles` of vitest.config.ts. ESM evaluates imports
// in order, so the variables are in place before any later module runs.
//
// Two properties the callers rely on:
//   - A variable that already exists in the environment is NOT overwritten
//     (Node's behaviour). That is how the `test.env` of vitest.config.ts wins
//     over the real `.env`.
//   - A missing `.env` is not an error: in production or CI the variables can
//     come from the environment alone. Only that case is ignored (ENOENT); any
//     other failure -- an unreadable file, a directory called `.env` -- throws.
import { loadEnvFile } from 'node:process'

/**
 * Loads `path` into the environment if the file exists. Returns `true` if it
 * was loaded and `false` if there was no file. Any other error is rethrown.
 */
export function loadEnvFileIfPresent(path = '.env'): boolean {
  try {
    loadEnvFile(path)
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

loadEnvFileIfPresent()
