// How a guardian of the suite PUTS THE RUN IN RED (feature 33, second pass).
//
// The two nets that protect the human's data -- his database (ADR-027) and his
// `var/` (ADR-029) -- can only check what they check AFTER the last test file
// has run, so they live in the teardown of `vitest.global-setup.ts`.
//
// And a teardown cannot fail the run by throwing. Measured end to end on
// 2026-08-26, after the review of feature 33 found it: an exception thrown there
// is reported as `error during close` and `vitest run` STILL EXITS 0, so
// `init.sh` reads a zero, prints «Todos los tests pasan» and carries on with his
// folder touched. A net that detects and does not stop anything is worse than no
// net, because it is trusted.
//
// So the run is failed the only way that survives that path: SETTING THE EXIT
// CODE. And the report is written to file descriptor 2 directly, not through
// `console`, for the same reason feature 23 already learnt in the ADR-017
// guardian: vitest intercepts the console and with the default reporter -- the
// one `init.sh` uses -- a `console.warn` is never printed.
export interface RunFailureSink {
  write(text: string): void
  fail(): void
}

const processSink: RunFailureSink = {
  write: (text) => {
    process.stderr.write(text)
  },
  fail: () => {
    process.exitCode = 1
  },
}

/**
 * Reports the problems found by the guardians and makes `vitest run` exit
 * non-zero. Returns whether it failed the run, so a caller can assert on it.
 *
 * With no problems it writes nothing and does NOT touch the exit code: a green
 * run stays green, and a failure of some other test keeps its own code.
 */
export function failRun(problems: string[], sink: RunFailureSink = processSink): boolean {
  if (problems.length === 0) return false
  sink.write(
    `\n${'='.repeat(78)}\n` +
      `LA SUITE HA TOCADO ALGO TUYO. La pasada se marca como FALLIDA.\n` +
      `${'='.repeat(78)}\n` +
      `${problems.join('\n\n')}\n` +
      `${'='.repeat(78)}\n\n`,
  )
  sink.fail()
  return true
}
