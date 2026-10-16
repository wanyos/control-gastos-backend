-- Feature 57 `deposit-totals-interest-only` (R14). Data only: no schema change.
--
-- Since feature 57, what a deposit movement adds to the income/expense totals
-- is computed on every read (an opening and a cancellation add 0, a maturity
-- adds only its interest), and its `excludedFromTotals` no longer counts. This
-- removes the marks that had been put on deposit movements by hand, so that the
-- "marked" filter and the listing stop calling them marked. Every other mark,
-- every other column and every other row stay as they are; `updatedAt` is not
-- written here.
--
-- The three prefixes repeat the ones of
-- `src/modules/myinvestor/myinvestor.deposit-maturity.ts`
-- (`classifyMyinvestorDepositMovement`), because a migration cannot call the
-- code: opening = expense starting with 'APERTURA DEP', cancellation = income
-- starting with 'CANCELACION DEP', maturity = income starting with
-- 'INTERESES DEP', all after the leading spaces. If they ever diverged, no sum
-- would change (the mark does not count on a deposit movement); only the
-- listing filtered by `excluded=only`.
UPDATE "Movement"
SET "excludedFromTotals" = false
WHERE "excludedFromTotals"
  AND "accountId" IN (SELECT id FROM "Account" WHERE bank = 'myinvestor')
  AND (
    (type = 'expense' AND ltrim(description) LIKE 'APERTURA DEP%')
    OR (
      type = 'income'
      AND (
        ltrim(description) LIKE 'CANCELACION DEP%'
        OR ltrim(description) LIKE 'INTERESES DEP%'
      )
    )
  );
