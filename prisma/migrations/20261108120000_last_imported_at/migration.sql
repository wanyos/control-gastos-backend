-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "lastImportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvestmentProduct" ADD COLUMN     "lastImportedAt" TIMESTAMP(3);
