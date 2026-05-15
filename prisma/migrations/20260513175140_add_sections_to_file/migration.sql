-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NORMAL',
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Section_fileId_idx" ON "Section"("fileId");

-- CreateIndex
CREATE INDEX "Section_orderIndex_idx" ON "Section"("orderIndex");

-- CreateIndex
CREATE INDEX "Section_type_idx" ON "Section"("type");
