-- Feature 60 `category-origin-and-rule-reapply` (R14). Data only: no schema change.
--
-- Gives `Movement.categorySource` to the movements that already had a category
-- before the column existed. Nothing recorded who had written each category, so:
--
--   * a movement in the root `Otros gastos` (kind `expense`) or the root
--     `Otros ingresos` (kind `income`) -> `closing`: it is what the closing step
--     of an import (`confirmAllMovements`) writes, and leaving it `closing` is what
--     lets a rule created or changed later move it to its own category;
--   * every other movement with a category -> `manual`: no rule will ever rewrite
--     it, which is the safe side when it is not known whether the human chose it
--     (specs/60-category-origin-and-rule-reapply/decisions.md, decision 2);
--   * a movement without a category keeps `categorySource` NULL.
--
-- The two generic categories are found as `closeImportedMovements` finds them:
-- root (no parent), by name and kind. Only `categorySource` is written; no other
-- column, `updatedAt` included. Both UPDATEs only touch NULLs, so running the
-- file again changes nothing that is already set.
UPDATE "Movement" m
SET "categorySource" = 'closing'
FROM "Category" c
WHERE c.id = m."categoryId"
  AND c."parentId" IS NULL
  AND m."categorySource" IS NULL
  AND (
    (c.kind = 'expense' AND c.name = 'Otros gastos')
    OR (c.kind = 'income' AND c.name = 'Otros ingresos')
  );

UPDATE "Movement"
SET "categorySource" = 'manual'
WHERE "categoryId" IS NOT NULL
  AND "categorySource" IS NULL;
