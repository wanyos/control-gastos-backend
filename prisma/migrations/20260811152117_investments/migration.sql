-- CreateEnum
CREATE TYPE "InvestmentProductType" AS ENUM ('fund', 'etf', 'managed_portfolio', 'deposit');

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "productId" INTEGER;

-- CreateTable
CREATE TABLE "InvestmentProduct" (
    "id" SERIAL NOT NULL,
    "bank" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InvestmentProductType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "openedAt" DATE,
    "closedAt" DATE,
    "principal" DECIMAL(10,2),
    "interestRate" DECIMAL(6,4),
    "expectedGain" DECIMAL(10,2),
    "maturityDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "invested" DECIMAL(10,2) NOT NULL,
    "marketValue" DECIMAL(10,2) NOT NULL,
    "gain" DECIMAL(10,2),
    "gainPercent" DECIMAL(7,4),
    "uninvestedCash" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentProduct_bank_name_key" ON "InvestmentProduct"("bank", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_productId_date_key" ON "Valuation"("productId", "date");

-- CreateIndex
CREATE INDEX "Movement_productId_idx" ON "Movement"("productId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InvestmentProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InvestmentProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
