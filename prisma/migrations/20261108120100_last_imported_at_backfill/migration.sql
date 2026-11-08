-- Feature 69 `last-imports` (R14). Data only: no schema change.
--
-- Gives `lastImportedAt` to what was imported before the column existed. No import
-- recorded the moment it ran, so the closest thing is the moment its rows were
-- stored (`createdAt`), never `updatedAt`: a manual change moves that one (a
-- product renamed by hand on 2026-11-08 did).
--
--   * an account -> the most recent `createdAt` of its movements; an account
--     without movements keeps NULL;
--   * a product -> the most recent among its own `createdAt` and the `createdAt`
--     of its photos (`Valuation` and `SavingsSnapshot`). A deposit has no photo,
--     so it gets its own `createdAt`. A photo uploaded again keeps the
--     `createdAt` of the first time (the upsert does not move it).
--
-- `GREATEST` of PostgreSQL ignores NULLs. Only `lastImportedAt` is written (a raw
-- UPDATE does not move `updatedAt`), and both UPDATEs only touch NULLs, so running
-- the file again changes nothing that is already set.
UPDATE "Account" a
SET "lastImportedAt" = m.last
FROM (SELECT "accountId", MAX("createdAt") AS last FROM "Movement" GROUP BY 1) m
WHERE m."accountId" = a.id AND a."lastImportedAt" IS NULL;

UPDATE "InvestmentProduct" p
SET "lastImportedAt" = GREATEST(
  p."createdAt",
  (SELECT MAX("createdAt") FROM "Valuation" v WHERE v."productId" = p.id),
  (SELECT MAX("createdAt") FROM "SavingsSnapshot" s WHERE s."productId" = p.id)
)
WHERE p."lastImportedAt" IS NULL;
