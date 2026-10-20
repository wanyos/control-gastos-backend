-- Feature 62 `own-accounts`: the own accounts table, the holder name forms and
-- the human's decision on a movement. The tables are born EMPTY: the human
-- fills them through /api/own-accounts. Existing movements get NULL in
-- `ownershipDecision` (undecided) and nothing else of them changes.

-- CreateEnum
CREATE TYPE "OwnAccountType" AS ENUM ('checking', 'savings', 'investment', 'deposit', 'crypto', 'other');

-- CreateEnum
CREATE TYPE "OwnershipDecision" AS ENUM ('mine', 'not_mine');

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "ownershipDecision" "OwnershipDecision";

-- CreateTable
CREATE TABLE "OwnAccount" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "accountNumber" TEXT,
    "type" "OwnAccountType" NOT NULL,
    "openedAt" DATE,
    "closedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnAccountText" (
    "id" SERIAL NOT NULL,
    "ownAccountId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "OwnAccountText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountHolderName" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AccountHolderName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnAccountText_ownAccountId_text_key" ON "OwnAccountText"("ownAccountId", "text");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHolderName_name_key" ON "AccountHolderName"("name");

-- AddForeignKey
ALTER TABLE "OwnAccountText" ADD CONSTRAINT "OwnAccountText_ownAccountId_fkey" FOREIGN KEY ("ownAccountId") REFERENCES "OwnAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
