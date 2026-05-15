-- CreateEnum
CREATE TYPE "ComparisonType" AS ENUM ('YOY', 'QOQ', 'sequential');

-- CreateEnum
CREATE TYPE "FluxoTrend" AS ENUM ('ACCELERATING', 'IMPROVING', 'STABLE', 'DECLINING', 'DETERIORATING');

-- AlterTable
ALTER TABLE "Section" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FluxoAnalysis" (
    "id" TEXT NOT NULL,
    "currentFileId" TEXT NOT NULL,
    "previousFileId" TEXT,
    "periodComparison" TEXT NOT NULL,
    "comparisonType" "ComparisonType" NOT NULL DEFAULT 'sequential',
    "revenueChange" DOUBLE PRECISION,
    "revenueChangePct" DOUBLE PRECISION,
    "revenueTrend" "FluxoTrend",
    "ebitdaChange" DOUBLE PRECISION,
    "ebitdaChangePct" DOUBLE PRECISION,
    "ebitdaTrend" "FluxoTrend",
    "netProfitChange" DOUBLE PRECISION,
    "netProfitChangePct" DOUBLE PRECISION,
    "netProfitTrend" "FluxoTrend",
    "fcoChange" DOUBLE PRECISION,
    "fcoChangePct" DOUBLE PRECISION,
    "fcoTrend" "FluxoTrend",
    "dividendsChange" DOUBLE PRECISION,
    "dividendsChangePct" DOUBLE PRECISION,
    "dividendsTrend" "FluxoTrend",
    "qualityScore" DOUBLE PRECISION,
    "anomalyDetected" BOOLEAN NOT NULL DEFAULT false,
    "anomalyReason" TEXT,
    "fluxoSummary" TEXT,
    "fluxoSensation" DOUBLE PRECISION,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FluxoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FluxoAnalysis_currentFileId_idx" ON "FluxoAnalysis"("currentFileId");

-- CreateIndex
CREATE INDEX "FluxoAnalysis_previousFileId_idx" ON "FluxoAnalysis"("previousFileId");

-- AddForeignKey
ALTER TABLE "FluxoAnalysis" ADD CONSTRAINT "FluxoAnalysis_currentFileId_fkey" FOREIGN KEY ("currentFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
