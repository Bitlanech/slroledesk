/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Customer" DROP COLUMN "updatedAt",
ADD COLUMN     "draftSavedAt" TIMESTAMP(3);
