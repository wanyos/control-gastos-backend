import { describe, expect, it } from 'vitest'

import { failRun, type RunFailureSink } from './test-guard.js'

function fakeSink(): RunFailureSink & { written: string; failed: number } {
  return {
    written: '',
    failed: 0,
    write(text: string) {
      this.written += text
    },
    fail() {
      this.failed += 1
    },
  }
}

describe('failRun', () => {
  it('fails the run and reports every problem, not just the first', () => {
    const sink = fakeSink()

    const failed = failRun(['la base ha cambiado', 'var/ ha cambiado'], sink)

    expect(failed).toBe(true)
    expect(sink.failed).toBe(1)
    expect(sink.written).toContain('la base ha cambiado')
    expect(sink.written).toContain('var/ ha cambiado')
    expect(sink.written).toContain('La pasada se marca como FALLIDA')
  })

  it('does nothing at all when there is no problem: a green run stays green', () => {
    const sink = fakeSink()

    expect(failRun([], sink)).toBe(false)
    expect(sink.written).toBe('')
    expect(sink.failed).toBe(0)
  })
})
