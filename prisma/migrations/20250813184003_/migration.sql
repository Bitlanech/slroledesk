/*
  Warnings:

  - Made the column `category` on table `Permission` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Permission" ADD COLUMN     "categoryPath" JSONB,
ALTER COLUMN "category" SET NOT NULL;
