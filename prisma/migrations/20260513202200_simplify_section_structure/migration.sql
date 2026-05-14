-- AlterTable
ALTER TABLE "Section" 
ADD COLUMN "data" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "error" TEXT;

-- DropTable
DROP TABLE "SectionData";

-- DropEnum
-- DROP TYPE "SectionData_status"; -- Not needed as status is now in Section
