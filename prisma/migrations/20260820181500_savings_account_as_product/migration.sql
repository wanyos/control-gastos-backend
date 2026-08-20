-- AlterEnum
ALTER TYPE "InvestmentProductType" ADD VALUE 'savings_account';

-- CreateTable
CREATE TABLE "SavingsSnapshot" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "openingBalance" DECIMAL(10,2) NOT NULL,
    "moneyIn" DECIMAL(10,2) NOT NULL,
    "moneyOut" DECIMAL(10,2) NOT NULL,
    "interest" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingsSnapshot_productId_date_key" ON "SavingsSnapshot"("productId", "date");

-- AddForeignKey
ALTER TABLE "SavingsSnapshot" ADD CONSTRAINT "SavingsSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InvestmentProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
