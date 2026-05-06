-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('MUITO_SAUDAVEL', 'SAUDAVEL', 'INSTAVEL', 'DOENTE', 'MUITO_DOENTE');

-- CreateEnum
CREATE TYPE "Trend" AS ENUM ('MELHORANDO', 'ESTAVEL', 'PIORANDO');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "revenue" DOUBLE PRECISION,
    "ebitda" DOUBLE PRECISION,
    "ebitdaMargin" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "netMargin" DOUBLE PRECISION,
    "netDebt" DOUBLE PRECISION,
    "leverage" DOUBLE PRECISION,
    "fco" DOUBLE PRECISION,
    "capex" DOUBLE PRECISION,
    "dividends" DOUBLE PRECISION,
    "aiSensation" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "projection" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Situation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'SAUDAVEL',
    "trend" "Trend" NOT NULL DEFAULT 'ESTAVEL',
    "lastAnalysisId" TEXT,
    "futureProjection" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Situation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE INDEX "Analysis_companyId_idx" ON "Analysis"("companyId");

-- CreateIndex
CREATE INDEX "Analysis_period_idx" ON "Analysis"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Situation_companyId_key" ON "Situation"("companyId");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Situation" ADD CONSTRAINT "Situation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
