-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('manual', 'rule', 'closing');

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "categorySource" "CategorySource";
