-- CreateTable
CREATE TABLE "RawExtraction" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawExtraction_fileId_idx" ON "RawExtraction"("fileId");

-- CreateIndex
CREATE INDEX "RawExtraction_status_idx" ON "RawExtraction"("status");

-- AddForeignKey
ALTER TABLE "RawExtraction" ADD CONSTRAINT "RawExtraction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
