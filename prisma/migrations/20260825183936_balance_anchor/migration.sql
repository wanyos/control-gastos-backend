-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "balanceAnchor" DECIMAL(10,2),
ADD COLUMN     "balanceAnchorDate" DATE,
ADD COLUMN     "balanceAnchorDaySequence" INTEGER;

-- AddConstraint
-- The anchor is an amount AND the point in history it belongs to: one without
-- the other is not an anchor. Declared here so it cannot depend on anyone
-- remembering it (feature 31, design.md §2).
ALTER TABLE "Account" ADD CONSTRAINT "Account_balance_anchor_pair"
  CHECK (("balanceAnchor" IS NULL) = ("balanceAnchorDate" IS NULL));
