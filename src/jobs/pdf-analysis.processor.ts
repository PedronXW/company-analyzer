import { PdfAnalysisService, PdfAnalysisResult } from '@/bedrock/pdf-analysis/pdf-analysis.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { DATA_EXTRACTION, PERIOD_EXTRACTION } from '@/prisma/prisma.constants';

/**
 * Processador de jobs de análise de PDF.
 *
 * Estratégia:
 * 1. Usa Bedrock para analisar o PDF completo
 * 2. Extrai seções, metadados e resumo
 * 3. Classifica seções como NORMAL (para processar) ou IGNORE (para pular)
 * 4. Garante que todas as páginas sejam cobertas por seções
 * 5. Dispara job de extração de dados para processar seções NORMAL
 *
 * Este job é o primeiro da pipeline de processamento,
 * preparando o documento para extração seção por seção.
 */
@Processor('pdf/analyze', {
  concurrency: 1,
  autorun: true,
})
export class PdfAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfAnalysisService: PdfAnalysisService,
    @InjectQueue(PERIOD_EXTRACTION) private readonly periodExtractionQueue: Queue,
    @InjectQueue(DATA_EXTRACTION) private readonly dataExtractionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;

    this.logger.log(`Processing PDF analysis job for file ${fileId}`);

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
      this.logger.log(`Calling Bedrock for PDF analysis on file ${fileId}`);

      // Chama o serviço de análise de PDF
      const analysisResult: PdfAnalysisResult =
        await this.pdfAnalysisService.analyzePdf(s3Uri);

      this.logger.log(`PDF analysis completed for file ${fileId}`);
      this.logger.log(`Found ${analysisResult.sections.length} sections`);

      // Validar e completar seções se necessário
      const validatedSections = this.validateAndCompleteSections(
        analysisResult.sections,
        analysisResult.metadata.totalPages,
      );

      this.logger.log(`Validated sections: ${validatedSections.length}`);

      // Contar NORMAL vs IGNORE
      const normalCount = validatedSections.filter(s => s.type === 'NORMAL').length;
      const ignoreCount = validatedSections.filter(s => s.type === 'IGNORE').length;
      this.logger.log(`Sections summary: ${normalCount} NORMAL, ${ignoreCount} IGNORE`);

      // Salvar seções no banco de dados como Section
      await this.saveSections(fileId, validatedSections);

      this.logger.log(
        `Saved PDF analysis results for file ${fileId} (${validatedSections.length} sections)`,
      );

      // Disparar job de extração de período para identificar o período do documento
      this.logger.log(`Disparando job de extração de período para file ${fileId}`);
      await this.periodExtractionQueue.add('period/extraction', {
        fileId,
      });

      this.logger.log(`Job de extração de período disparado para file ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to analyze PDF file ${fileId}: ${error}`);

      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          status: 'failed',
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Valida e completa as seções para garantir que todas as páginas sejam cobertas.
   * - Verifica se há gaps entre seções
   * - Cria seções "Other" para páginas não classificadas (como IGNORE)
   */
  private validateAndCompleteSections(
    sections: Array<{ id: string; title: string; pageStart: number; pageEnd: number; type?: string }>,
    totalPages: number,
  ): Array<{ id: string; title: string; pageStart: number; pageEnd: number; type: string }> {
    if (sections.length === 0) {
      this.logger.warn(`No sections found, creating single section for all ${totalPages} pages`);
      return [
        {
          id: 'section-1',
          title: 'Other - Documento Completo',
          pageStart: 1,
          pageEnd: totalPages,
          type: 'IGNORE', // Página genérica sem valor extraível
        },
      ];
    }

    // Ordenar seções por pageStart
    const sorted = [...sections].sort((a, b) => a.pageStart - b.pageStart);

    const validatedSections: any[] = [];
    let currentPage = 1;

    for (const section of sorted) {
      // Se houver gap antes desta seção, criar seção "Other"
      if (section.pageStart > currentPage) {
        this.logger.log(
          `Creating gap section from page ${currentPage} to ${section.pageStart - 1}`,
        );
        validatedSections.push({
          id: `gap-${currentPage}`,
          title: `Other - Conteúdo não classificado (pág. ${currentPage}-${section.pageStart - 1})`,
          pageStart: currentPage,
          pageEnd: section.pageStart - 1,
          type: 'IGNORE', // Gaps são automaticamente IGNORE
        });

        currentPage = section.pageStart;
      }

      validatedSections.push({
        ...section,
        type: section.type === 'IGNORE' ? 'IGNORE' : 'NORMAL', // Garante type não undefined
      });

      // Atualizar currentPage para depois desta seção
      currentPage = section.pageEnd + 1;
    }

    // Se houver páginas restantes no final
    if (currentPage <= totalPages) {
      this.logger.log(`Creating final gap section from page ${currentPage} to ${totalPages}`);
      validatedSections.push({
        id: `gap-${currentPage}`,
        title: `Other - Conteúdo não classificado (pág. ${currentPage}-${totalPages})`,
        pageStart: currentPage,
        pageEnd: totalPages,
        type: 'IGNORE',
      });
    }

    // Validar se todas as páginas foram cobertas
    const totalCovered = validatedSections.reduce(
      (sum, s) => sum + (s.pageEnd - s.pageStart + 1),
      0,
    );
    if (totalCovered !== totalPages) {
      this.logger.warn(
        `Coverage mismatch: ${totalCovered} pages covered vs ${totalPages} total`,
      );
    }

    return validatedSections;
  }

  private async saveSections(fileId: string, sections: any[]) {
    for (const [index, section] of sections.entries()) {
      // Salvar a Section com data inicial (resumo)
      const savedSection = await this.prisma.section.create({
        data: {
          fileId,
          title: section.title || 'Sem título',
          description: section.description,
          pageStart: section.pageStart || 1,
          pageEnd: section.pageEnd || 1,
          orderIndex: index,
          type: section.type || 'NORMAL',
          data: JSON.stringify({
            summary: section.summary || '',
            extractedAt: new Date().toISOString(),
          }),
        },
      });

      this.logger.log(`Saved section: ${savedSection.title} (${savedSection.type}) (pages ${savedSection.pageStart}-${savedSection.pageEnd})`);
    }
  }
}
