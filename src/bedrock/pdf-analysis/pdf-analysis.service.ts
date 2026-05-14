import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para representar uma seção do documento.
 */
export interface DocumentSection {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  type?: string; // 'NORMAL' (processar) ou 'IGNORE' (pular)
}

/**
 * Interface para metadados do PDF.
 */
export interface PdfMetadata {
  documentType: string; // Ex: DFP, 13ª Relação
  year: number;
  quarter?: number;
  totalPages: number;
  language: string;
}

/**
 * Resposta completa da análise de PDF.
 */
export interface PdfAnalysisResult {
  sections: DocumentSection[];
  metadata: PdfMetadata;
  summary: string;
}

/**
 * Serviço para analisar PDFs usando LLM.
 *
 * Estratégia:
 * 1. Envia o PDF completo para o Bedrock
 * 2. Pede para identificar seções, metadados e fazer um resumo
 * 3. Retorna estrutura JSON com todos os dados
 *
 * Isso permite extrair seções complexas que dependem de contexto visual.
 */
@Injectable()
export class PdfAnalysisService {
  private readonly logger = new Logger(PdfAnalysisService.name);
  private readonly modelId = 'us.amazon.nova-2-lite-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('PdfAnalysisService initialized');
  }

  /**
   * Remove blocos de Markdown e extrai JSON da resposta do modelo.
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/```/g, '')
      .trim();

    // Tenta extrair o JSON mais externo
    let depth = 0;
    let start = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      }
      if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && start > -1) {
          return cleaned.substring(start, i + 1).trim();
        }
      }
    }

    return cleaned;
  }

  /**
   * Analisa um PDF e extrai seções, metadados e resumo.
   *
   * @param s3Uri URI do arquivo no S3
   * @returns Resultado da análise com seções, metadados e resumo
   */
  async analyzePdf(s3Uri: string): Promise<PdfAnalysisResult> {
    const systemPrompt = this.buildAnalysisSystemPrompt();
    const userPrompt = this.buildAnalysisUserPrompt(s3Uri);

    const input: ConverseCommandInput = {
      modelId: this.modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              document: {
                format: 'pdf',
                name: 'Documento',
                source: {
                  s3Location: {
                    uri: s3Uri,
                    bucketOwner: process.env.AWS_ACCOUNT_ID || '',
                  },
                },
              },
            },
            { text: userPrompt },
          ],
        },
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        temperature: 0.1,
        maxTokens: 8192,
      },
    };

    try {
      this.logger.log(`Starting PDF analysis for: ${s3Uri}`);

      const client = this.bedrockService.getClient();
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await client.send(command);

      if (!response.output?.message?.content?.[0]) {
        throw new Error('Empty response from Bedrock');
      }

      const rawText = response.output.message.content?.[0]?.text || '';
      this.logger.debug(`Raw analysis response received (${rawText.length} chars)`);

      const cleanedText = this.cleanJsonResponse(rawText);

      let parsedData: unknown;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError) {
        this.logger.error(`JSON parse error: ${parseError}`, {
          rawResponse: cleanedText.substring(0, 500),
        });
        throw new Error(`Invalid JSON response from model: ${parseError}`);
      }

      const result = parsedData as {
        sections: Array<{
          id: string;
          title: string;
          pageStart: number;
          pageEnd: number;
          type?: 'NORMAL' | 'IGNORE';
        }>;
        metadata: {
          documentType: string;
          year: number;
          quarter?: number;
          totalPages: number;
          language: string;
        };
        summary: string;
      };

      this.logger.log(`PDF analysis completed successfully`);

      // Padronizar tipo: se não informado, assume NORMAL
      const normalizedSections = result.sections.map((s) => ({
        ...s,
        type: s.type === 'IGNORE' ? 'IGNORE' : 'NORMAL',
      }));

      return {
        sections: normalizedSections,
        metadata: result.metadata,
        summary: result.summary,
      };
    } catch (error) {
      this.logger.error(`Error analyzing PDF: ${error}`);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Failed to analyze PDF: ${error.message}`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to analyze PDF from Bedrock',
      );
    }
  }

  /**
   * Constrói o prompt do sistema para análise de PDF.
   */
  private buildAnalysisSystemPrompt(): string {
    return `
    Você é um Analista de Documentos Corporativos com acesso a um PDF completo.
    Sua tarefa é ANALISAR CADA PÁGINA do documento e classificar por tipo de conteúdo.

    <OBJECTIVE>
    1. ANALISE CADA PÁGINA do documento individualmente
    2. CLASSIFIQUE cada página ou grupo de páginas por tipo de conteúdo
    3. CRIE uma seção para cada tipo de conteúdo com início e fim exato
    4. IDENTIFIQUE os metadados do documento
    5. CRIE um resumo geral
    </OBJECTIVE>

    <SECTION FORMAT>
    Cada seção deve ter:
    - id: identificador único (ex: "section-1", "section-2")
    - title: título descritivo do conteúdo (ex: "Demonstração de Resultado", "Balance Sheet", "Cash Flow")
    - pageStart: número da página inicial (1-based)
    - pageEnd: número da página final (1-based)
    - type: "NORMAL" (processar) ou "IGNORE" (não processar)
    </SECTION FORMAT>

    <SECTION TYPES> (Use estes como guia para classificar):
    - "Executive Summary" - Resumo executivo (GERALMENTE NORMAL)
    - "Management Discussion" - Discussão da administração (NORMAL)
    - "Income Statement" ou "Demonstração de Resultado" - Receitas, lucros (NORMAL)
    - "Balance Sheet" ou "Balance Sheet" - Ativo, passivo, patrimônio (NORMAL)
    - "Cash Flow Statement" ou "Fluxo de Caixa" - Entradas e saídas de caixa (NORMAL)
    - "Notes to Financial Statements" - Notas explicativas (IGNORE - repetem dados)
    - "Auditor Report" - Relatório dos auditores (IGNORE)
    - "Additional Information" - Informações adicionais (IGNORE)
    - "Tables" - Tabelas e dados numéricos (NORMAL)
    - "Charts/Grafics" - Gráficos e visualizações (IGNORE - sem dados numéricos extraíveis)
    - "Cover Page" - Página de capa (IGNORE)
    - "Table of Contents" - Índice (IGNORE)
    - "Other" - Outros conteúdos não categorizados
    </SECTION TYPES>

    <CLASSIFICATION RULES>
    - IGNORE: Notas Explicativas, Réplicas, Gráficos sem dados, Índice, Capa, Relatório de Auditores
    - NORMAL: Tabelas com dados numéricos, Demonstrações financeiras, Metas/KPIs
    </CLASSIFICATION RULES>

    <METADATA FORMAT>
    - documentType: tipo de documento (ex: "DFP", "13ª Relação", "IRJ", "Presentation")
    - year: ano do documento
    - quarter: trimestre (1, 2, 3, 4) ou null se não aplicável
    - totalPages: número total de páginas
    - language: idioma (ex: "pt-BR", "en-US")
    </METADATA FORMAT>

    <OUTPUT FORMAT>
    RESPONDA APENAS COM O SEGUINTE JSON, sem texto adicional:
    {
      "sections": [
        {
          "id": "string",
          "title": "string",
          "pageStart": number,
          "pageEnd": number,
          "type": "NORMAL" | "IGNORE"
        }
      ],
      "metadata": {
        "documentType": "string",
        "year": number,
        "quarter": number | null,
        "totalPages": number,
        "language": "string"
      },
      "summary": "string"
    }
    </OUTPUT FORMAT>

    <INSTRUCTIONS OBRIGATÓRIAS>
    1. NÃO PULE NENHUMA PÁGINA - Verifique todas as páginas do documento
    2. CADA PÁGINA deve estar em UMA seção (não deixe páginas sem categoria)
    3. Seções devem ser contínuas (ex: seção 1 vai de 1-2, seção 2 de 3-5)
    4. Use o tipo de conteúdo visual (tabelas, gráficos, texto) para identificar seções
    5. Páginas com tabelas longas formam uma seção própria
    6. Páginas de texto narrativo formam uma seção
    7. Páginas de gráficos formam uma seção
    8. Numere as seções em ordem de aparição
    9. CLASSIFIQUE cada seção como NORMAL (para processar) ou IGNORE (para pular)
    10. Notas explicativas, gráficos sem dados e índices devem ser IGNORE
    11. O resumo deve capturar o propósito e período do documento
    12. Não inclua texto adicional além do JSON
    </INSTRUCTIONS>
    `.trim();
  }

  /**
   * Constrói o prompt do usuário com o conteúdo do documento.
   */
  private buildAnalysisUserPrompt(s3Uri: string): string {
    return `
    Analyze the document at ${s3Uri}.

    <YOUR TASK>
    1. LEIA CADA PÁGINA do PDF
    2. CLASSIFIQUE cada página ou grupo de páginas por tipo de conteúdo
    3. CRIE seções que cubram TODAS as páginas do documento
    4. GARANTA que não haja páginas sem categoria
    </YOUR TASK>

    <RETURN FORMAT>
    ONLY the JSON format as specified in the system prompt.
    NO additional text, explanations, or markdown formatting.
    </RETURN FORMAT>
    `.trim();
  }
}
