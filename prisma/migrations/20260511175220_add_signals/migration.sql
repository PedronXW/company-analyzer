-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('SENTIMENT', 'FUNDAMENTAL', 'PRICE');

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisSignal" (
    "analysisId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,

    CONSTRAINT "AnalysisSignal_pkey" PRIMARY KEY ("analysisId","signalId")
);

-- CreateIndex
CREATE INDEX "Signal_ticker_idx" ON "Signal"("ticker");

-- CreateIndex
CREATE INDEX "Signal_source_idx" ON "Signal"("source");

-- CreateIndex
CREATE INDEX "Signal_processed_idx" ON "Signal"("processed");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisSignal" ADD CONSTRAINT "AnalysisSignal_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisSignal" ADD CONSTRAINT "AnalysisSignal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
