import { Module } from '@nestjs/common';
import { BedrockService } from './bedrock.service';
import { DataExtractionService } from './data-extraction/data-extraction.service';

/**
 * Módulo de serviços de Bedrock.
 *
 * Responsabilidades:
 * - Fornecer acesso centralizado ao cliente Bedrock
 * - Exportar serviços especializados (DataExtractionService)
 * - Usado por workers de processamento assíncrono
 */
@Module({
  providers: [BedrockService, DataExtractionService],
  exports: [BedrockService, DataExtractionService],
})
export class BedrockModule {}
