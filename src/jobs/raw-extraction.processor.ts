import { RawExtractionData, DataExtractionService } from '@/bedrock/data-extraction/data-extraction.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { DATA_ANALYSIS } from '@/prisma/prisma.constants';

/**
 * Processador de jobs de extração BRUTA de dados financeiros de empresa.
 *
 * Estratégia:
 * 1. Processa o PDF completo usando Bedrock
 * 2. Usa indicação de seção no prompt para focar na área desejada
 * 3. Salva em Section.data (JSON) - um array com os dados extraídos
 * 4. Filtra apenas seções do tipo NORMAL (pula IGNORE como Notas Explicativas)
 * 5. Emite job 'data/analyze' para processar os dados brutos
 *
 * Benefícios:
 * - Mantém estrutura visual do PDF (tabelas são compreendidas pelo modelo)
 * - Foco direcionado via prompt (seção específica)
 * - Pula seções que repetem dados ou não têm valor extraível
 * - Dados de cada seção guardados no JSON da Section
 */
@Processor('data/extraction', {
  concurrency: 1,
  autorun: true,
})
export class RawExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(RawExtractionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private dataExtractionService: DataExtractionService,
    @InjectQueue(DATA_ANALYSIS) private readonly dataAnalysisQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string; period?: string }>): Promise<void> {
    const { fileId, period } = job.data;

    this.logger.log(`Processing raw data extraction job for file ${fileId}`);

    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const s3Uri = `s3://panap-ravel-files/${fileId}`;

    try {
      // Buscar seções pré-extraídas - apenas do tipo NORMAL
      const sections = await this.prisma.section.findMany({
        where: {
          fileId,
          type: 'NORMAL', // Apenas seções para processar (type é string no Prisma)
        },
        orderBy: { orderIndex: 'asc' },
      });

      this.logger.log(`Found ${sections.length} NORMAL sections to process (ignoring IGNORE sections)`);

      if (sections.length > 0) {
        // Processar seções individualmente usando o PDF completo
        for (const section of sections) {
          try {
            this.logger.log(`Processing section: ${section.title}`);

            // Processar o PDF completo, mas focar na seção específica
            const sectionData = await this.dataExtractionService.extractFinancialData(s3Uri, section.title);

            // Atualizar Section.data com os dados extraídos
            await this.prisma.section.update({
              where: { id: section.id },
              data: {
                data: JSON.stringify({
                  extractedItems: sectionData.extractedData.map((item) => ({
                    name: item.name,
                    value: item.value,
                    unit: item.unit,
                    source: 'extraction',
                    extractedAt: new Date().toISOString(),
                  })),
                }),
                status: 'pending',
              },
            });

            this.logger.log(`Extracted ${sectionData.extractedData.length} data points from section: ${section.title}`);
          } catch (sectionError) {
            this.logger.warn(`Failed to process section ${section.title}: ${sectionError}`);
          }
        }

        this.logger.log(`Completed processing ${sections.length} NORMAL sections for file ${fileId}`);
      } else {
        // Fallback: processar o PDF completo (sem seções NORMAL)
        this.logger.log(`No NORMAL sections found, processing PDF complete for file ${fileId}`);
        const extractionData = await this.dataExtractionService.extractFinancialData(s3Uri);

        this.logger.log(`Extracted ${extractionData.extractedData.length} data points from PDF`);
      }

      // Adicionar job para análise
      await this.dataAnalysisQueue.add('data/analyze', {
        fileId,
        period,
      });

      this.logger.log(`Emitted analysis job for file ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to process raw extraction job for file ${fileId}: ${error}`);
      throw error;
    }
  }
}
