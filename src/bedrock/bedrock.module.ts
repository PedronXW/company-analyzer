import { Module } from '@nestjs/common';
import { BedrockService } from './bedrock.service';
import { DataExtractionService } from './data-extraction/data-extraction.service';
import { DataAnalysisService } from './data-analysis/data-analysis.service';
import { PdfAnalysisService } from './pdf-analysis/pdf-analysis.service';
import { FluxoAnalysisService } from './fluxo-analysis/fluxo-analysis.service';
import { PeriodExtractionService } from './period-extraction/period-extraction.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Módulo de serviços de Bedrock.
 *
 * Responsabilidades:
 * - Fornecer acesso centralizado ao cliente Bedrock
 * - Exportar serviços especializados (DataExtractionService, PdfAnalysisService, FluxoAnalysisService)
 * - Usado por workers de processamento assíncrono
 */
@Module({
  imports: [PrismaModule],
  providers: [
    BedrockService,
    DataExtractionService,
    DataAnalysisService,
    PdfAnalysisService,
    FluxoAnalysisService,
    PeriodExtractionService,
  ],
  exports: [
    BedrockService,
    DataExtractionService,
    DataAnalysisService,
    PdfAnalysisService,
    FluxoAnalysisService,
    PeriodExtractionService,
  ],
})
export class BedrockModule {}
