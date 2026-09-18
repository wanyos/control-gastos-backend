-- CreateEnum
CREATE TYPE "ImportWarningStatus" AS ENUM ('pending', 'reviewed');

-- CreateTable
CREATE TABLE "ImportUnparsedRow" (
    "id" SERIAL NOT NULL,
    "bank" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportUnparsedRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBalanceMismatch" (
    "id" SERIAL NOT NULL,
    "bank" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "bookingDate" DATE NOT NULL,
    "check" TEXT NOT NULL,
    "computed" DECIMAL(10,2) NOT NULL,
    "fromFile" DECIMAL(10,2) NOT NULL,
    "status" "ImportWarningStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBalanceMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportUnparsedRow_identity_key" ON "ImportUnparsedRow"("bank", "year", "fileName", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportBalanceMismatch_status_idx" ON "ImportBalanceMismatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBalanceMismatch_identity_key" ON "ImportBalanceMismatch"("bank", "year", "fileName", "accountId", "bookingDate", "check", "computed", "fromFile");

-- AddForeignKey
ALTER TABLE "ImportBalanceMismatch" ADD CONSTRAINT "ImportBalanceMismatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
