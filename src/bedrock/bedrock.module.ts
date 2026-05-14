import { Module } from '@nestjs/common';
import { BedrockService } from './bedrock.service';
import { DataExtractionService } from './data-extraction/data-extraction.service';
import { DataAnalysisService } from './data-analysis/data-analysis.service';
import { PdfAnalysisService } from './pdf-analysis/pdf-analysis.service';

/**
 * Módulo de serviços de Bedrock.
 *
 * Responsabilidades:
 * - Fornecer acesso centralizado ao cliente Bedrock
 * - Exportar serviços especializados (DataExtractionService, DataAnalysisService, PdfAnalysisService)
 * - Usado por workers de processamento assíncrono
 */
@Module({
  providers: [BedrockService, DataExtractionService, DataAnalysisService, PdfAnalysisService],
  exports: [BedrockService, DataExtractionService, DataAnalysisService, PdfAnalysisService],
})
export class BedrockModule {}
