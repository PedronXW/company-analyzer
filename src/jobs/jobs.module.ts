import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/prisma/prisma.module';
import { BedrockModule } from '@/bedrock/bedrock.module';

// Processadores
import { RawExtractionProcessor } from './raw-extraction.processor';
import { DataAnalysisProcessor } from './data-analysis.processor';
import { FluxoAnalysisProcessor } from './fluxo-analysis.processor';
import { PdfAnalysisProcessor } from './pdf-analysis.processor';
import { FileUploadProcessor } from './file-upload.processor';
import { PeriodExtractionProcessor } from './period-extraction.processor';

// Constantes
import {
  FILE_UPLOAD_QUEUE,
  PDF_ANALYSIS,
  DATA_EXTRACTION,
  DATA_ANALYSIS,
  PERIOD_EXTRACTION,
  FLUXO_ANALYSIS,
} from '@/prisma/prisma.constants';

/**
 * Módulo de processadores de jobs (BullMQ).
 *
 * Responsabilidades:
 * - Registrar todos os processadores de filas
 * - Configurar as filas BullMQ usadas na aplicação
 *
 * Processadores:
 * - FileUploadProcessor: Processa uploads de arquivos
 * - PdfAnalysisProcessor: Analisa PDFs e extrai seções
 * - RawExtractionProcessor: Extrai dados brutos de PDFs
 * - DataAnalysisProcessor: Analisa dados com Bedrock
 * - FluxoAnalysisProcessor: Compara lançamentos entre si
 */
@Module({
  imports: [
    PrismaModule,
    BedrockModule,
    BullModule.registerQueue(
      { name: FILE_UPLOAD_QUEUE },
      { name: PDF_ANALYSIS },
      { name: DATA_EXTRACTION },
      { name: DATA_ANALYSIS },
      { name: PERIOD_EXTRACTION },
      { name: FLUXO_ANALYSIS },
    ),
  ],
  providers: [
    RawExtractionProcessor,
    DataAnalysisProcessor,
    FluxoAnalysisProcessor,
    PdfAnalysisProcessor,
    FileUploadProcessor,
    PeriodExtractionProcessor,
  ],
  exports: [
    RawExtractionProcessor,
    DataAnalysisProcessor,
    FluxoAnalysisProcessor,
    PdfAnalysisProcessor,
    FileUploadProcessor,
    PeriodExtractionProcessor,
  ],
})
export class JobsModule {}
