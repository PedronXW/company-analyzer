import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

// Application Layer
import { UploadService } from './upload.service';

// Infrastructure Layer - Repositories
import { PrismaModule } from '@/prisma/prisma.module';
import { UploadController } from './upload.controller';

// Infrastructure Layer - Workers
import { FileUploadProcessor } from '@/jobs/file-upload.processor';
import { PdfAnalysisProcessor } from '@/jobs/pdf-analysis.processor';
import { RawExtractionProcessor } from '@/jobs/raw-extraction.processor';
import { DataAnalysisProcessor } from '@/jobs/data-analysis.processor';

// Infrastructure Layer - Bedrock
import { BedrockModule } from '@/bedrock/bedrock.module';
import { DATA_ANALYSIS, DATA_EXTRACTION, PDF_ANALYSIS, FLUXO_ANALYSIS, PERIOD_EXTRACTION } from '@/prisma/prisma.constants';

/**
 * Módulo de upload de arquivos.
 *
 * Responsabilidades:
 * - Upload para S3
 * - Adicionar jobs à fila de processamento assíncrono
 * - Disparar job de análise de PDF após o processamento
 *
 * Fluxo (Nova Arquitetura):
 * 1. FileUploadProcessor (company/upload) -> processa file e adiciona job pdf/analyze
 * 2. PdfAnalysisProcessor (pdf/analyze) -> analisa PDF, extrai seções, salva em File.sections
 * 3. RawExtractionProcessor (data/extraction) -> extrai dados seção por seção usando File.sections
 * 4. DataAnalysisProcessor (data/analyze) -> analisa dados do RawExtraction, salva Analysis
 * 5. FluxoAnalysisProcessor (fluxo/analyze) -> compara lançamentos entre si
 */
@Module({
  imports: [
    PrismaModule,
    BedrockModule,
    BullModule.registerQueue(
      { name: 'company/upload' },
      { name: PDF_ANALYSIS },
      { name: DATA_EXTRACTION },
      { name: DATA_ANALYSIS },
      { name: PERIOD_EXTRACTION },
      { name: FLUXO_ANALYSIS },
    ),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    FileUploadProcessor,
    PdfAnalysisProcessor,
    RawExtractionProcessor,
    DataAnalysisProcessor,
  ],
  exports: [UploadService],
})
export class UploadModule { }
