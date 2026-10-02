-- AlterTable
ALTER TABLE "ImportUnparsedRow"
  ADD COLUMN "status" "ImportWarningStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);
