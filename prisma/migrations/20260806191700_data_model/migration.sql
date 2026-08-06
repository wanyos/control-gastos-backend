-- Feature 8 "data-model": replaces the bootstrap placeholder (Expense + old
-- Category) with the real cash-flow model (Account, Category, Movement).
-- Breaking change: the old tables hold no real data, so they are dropped
-- instead of migrated (see specs/data-model/design.md §8).

-- DropTable (Expense first: it holds the FK to the old Category)
DROP TABLE IF EXISTS "Expense";

-- DropTable
DROP TABLE IF EXISTS "Category";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('expense', 'income');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('expense', 'income', 'neutral');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'cash', 'bank_transfer', 'direct_debit');

-- CreateEnum
CREATE TYPE "MovementOrigin" AS ENUM ('imported', 'manual');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('confirmed', 'pending_review');

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "iban" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'checking',
    "initialBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" SERIAL NOT NULL,
    "type" "MovementType" NOT NULL,
    "bookingDate" DATE NOT NULL,
    "valueDate" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "balanceAfter" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "paymentMethod" "PaymentMethod",
    "origin" "MovementOrigin" NOT NULL DEFAULT 'imported',
    "status" "MovementStatus" NOT NULL DEFAULT 'pending_review',
    "transferId" TEXT,
    "daySequence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_iban_key" ON "Account"("iban");

-- CreateIndex
CREATE UNIQUE INDEX "Category_parentId_kind_name_key" ON "Category"("parentId", "kind", "name");

-- CreateIndex
CREATE INDEX "Movement_accountId_bookingDate_daySequence_idx" ON "Movement"("accountId", "bookingDate", "daySequence");

-- CreateIndex
CREATE INDEX "Movement_transferId_idx" ON "Movement"("transferId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (raw SQL: Prisma 7 cannot express a PARTIAL unique index)
-- Dedup of imported movements. `daySequence` is part of the key on purpose:
-- a real statement brings identical legitimate lines the same day (three
-- `TRANS INM/ Openbank -1000,00` on 2026-07-24 in the sample), and without it
-- two of the three would be silently discarded as duplicates.
-- `manual` movements stay out of the predicate: no uniqueness is imposed on them.
CREATE UNIQUE INDEX "Movement_imported_dedup_key"
  ON "Movement" ("accountId", "bookingDate", "type", "amount", "description", "daySequence")
  WHERE "origin" = 'imported';

-- CreateIndex (raw SQL: Prisma 7 cannot express NULLS NOT DISTINCT)
-- Postgres treats NULLs as distinct, so the plain unique index above would let
-- two ROOT categories (parentId IS NULL) share kind + name. Same name and same
-- columns, so Prisma still sees the unique it expects.
DROP INDEX "Category_parentId_kind_name_key";
CREATE UNIQUE INDEX "Category_parentId_kind_name_key"
  ON "Category" ("parentId", "kind", "name") NULLS NOT DISTINCT;
