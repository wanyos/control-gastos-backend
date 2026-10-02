// How this bank is wired into the importer (features 20 and 26). These two
// tests lived next to the tests of the route this bank had until feature 52;
// what they assert is about the registries of `src/app.ts`, so they stayed.
import { describe, expect, it } from 'vitest'

import { bankParsers, productParsers } from '../../app.js'

describe('Trade Republic in the importer registries', () => {
  it('is NOT in the STATEMENT registry: it has no statement to import (R16)', () => {
    expect(bankParsers.map((adapter) => adapter.bank)).not.toContain('trade-republic')
    // And the registry is the real one, not an empty list that would pass by
    // accident: the other banks are in it.
    expect(bankParsers.map((adapter) => adapter.bank)).toContain('bankinter')
  })

  it('IS in the PRODUCT registry, reading only its .json (feature 26, R10)', () => {
    // Feature 26 gave the importer a second registry. The `.pdf` of this bank
    // is still read by nobody: only the hand-written `.json` enters.
    // Written as "is in" and not "is the only one in" since feature 29, which
    // added MyInvestor to the same registry. What this test protects is THIS
    // bank's entry: present, and reading `.json` and nothing else.
    expect(productParsers.map((adapter) => adapter.bank)).toContain('trade-republic')
    expect(productParsers.find((adapter) => adapter.bank === 'trade-republic')?.extensions).toEqual(
      ['.json'],
    )
  })
})
