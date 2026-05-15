/*
  Warnings:

  - You are about to drop the `RawExtraction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RawExtraction" DROP CONSTRAINT "RawExtraction_fileId_fkey";

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "period" TEXT,
ADD COLUMN     "periodConfidence" INTEGER;

-- DropTable
DROP TABLE "RawExtraction";
