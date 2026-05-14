import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { z } from 'zod';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para a resposta de análise de extração de dados financeiros.
 */
export interface DataAnalysisResponse {
  period?: string | null; // Ex: 1T26, 4T25
  revenue?: number | null;
  ebitda?: number | null;
  ebitdaMargin?: number | null;
  netProfit?: number | null;
  netMargin?: number | null;
  netDebt?: number | null;
  leverage?: number | null;
  fco?: number | null;
  capex?: number | null;
  dividends?: number | null;
  aiSensation?: number | null;
  aiSummary?: string | null;
  projection?: {
    expectedRevenue?: number | null;
    expectedNetProfit?: number | null;
    expectedDividends?: number | null;
    growthRate?: number | null;
  } | null;
}

/**
 * Schema Zod para validação da resposta de análise.
 */
const DataAnalysisResponseSchema = z.object({
  period: z.string().nullable().optional(),
  revenue: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  ebitdaMargin: z.number().nullable().optional(),
  netProfit: z.number().nullable().optional(),
  netMargin: z.number().nullable().optional(),
  netDebt: z.number().nullable().optional(),
  leverage: z.number().nullable().optional(),
  fco: z.number().nullable().optional(),
  capex: z.number().nullable().optional(),
  dividends: z.number().nullable().optional(),
  aiSensation: z.number().nullable().optional(),
  aiSummary: z.string().nullable().optional(),
  projection: z.object({
    expectedRevenue: z.number().nullable().optional(),
    expectedNetProfit: z.number().nullable().optional(),
    expectedDividends: z.number().nullable().optional(),
    growthRate: z.number().nullable().optional(),
  }).nullable().optional(),
});

/**
 * Serviço especializado em analisar dados brutos de extração financeira.
 *
 * Estratégia: O prompt de análise recebe os dados brutos extraídos e:
 * - Identifica o período (ano/trimestre)
 * - Valida e corrige valores se necessário
 * - Calcula margens se tiver valores absolutos
 * - Gera análise sintética (aiSensation, aiSummary)
 * - Cria projeções baseadas em tendências
 */
@Injectable()
export class DataAnalysisService {
  private readonly logger = new Logger(DataAnalysisService.name);
  private readonly modelId = 'us.amazon.nova-2-lite-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('DataAnalysisService initialized');
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

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    return cleaned.trim();
  }

  /**
   * Analisa dados brutos de extração e retorna dados processados para análise.
   *
   * @param rawExtractionId ID do RawExtraction a ser analisado
   * @param rawData Dados brutos da extração (JSON com extractedData e metadata)
   * @returns Dados analisados prontos para salvar no Analysis
   */
  async analyzeExtraction(
    rawExtractionId: string,
    rawData: unknown,
  ): Promise<DataAnalysisResponse> {
    const systemPrompt = this.buildAnalysisSystemPrompt();
    const userPrompt = this.buildAnalysisUserPrompt(rawExtractionId, rawData);

    const input: ConverseCommandInput = {
      modelId: this.modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }],
        },
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        temperature: 0.1,
        maxTokens: 4096,
      },
    };

    try {
      this.logger.log(`Starting analysis for RawExtraction ${rawExtractionId}`);

      const client = this.bedrockService.getClient();
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await client.send(command);

      if (!response.output?.message?.content?.[0]) {
        throw new Error('Empty response from Bedrock');
      }

      const rawText = response.output.message.content?.[0]?.text || '';

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('No text content in Bedrock response');
      }

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

      const validatedData = DataAnalysisResponseSchema.parse(parsedData);

      this.logger.log(`Analysis completed for RawExtraction ${rawExtractionId}`);

      return validatedData;
    } catch (error) {
      this.logger.error(`Error analyzing extraction ${rawExtractionId}: ${error}`);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Failed to analyze extraction: ${error.message}`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to analyze extraction from Bedrock',
      );
    }
  }

  /**
   * Constrói o prompt do sistema para análise de extração.
   * Foco: analisar dados já extraídos, não extrair de PDF.
   */
  private buildAnalysisSystemPrompt(): string {
    return `
    Você é um Analista Financeiro Senior que recebe dados já extraídos de um documento corporativo.
    Sua tarefa é ANALISAR e PROCESSAR esses dados, não extrair do zero.

    <OBJECTIVE>
    Analise os dados brutos recebidos e:
    1. Identifique ou infera o período (ex: 1T26, 4T25, Ano fiscal 2024)
    2. Valide os valores - corrija se necessário
    3. Calcule margens se só tiver valores absolutos (ex: ebitdaMargin = ebitda/receita*100)
    4. Gere análise sintética (aiSensation, aiSummary)
    5. Crie projeções baseadas em tendências se possível
    </OBJECTIVE>

    <INPUT FORMAT YOU WILL RECEIVE>
    {
      "extractedData": [
        {"name": "Receita Líquida", "value": "125000", "unit": "milhões de BRL"},
        {"name": "EBITDA", "value": "42000", "unit": "milhões de BRL"},
        {"name": "EBITDA Margin", "value": "33.6", "unit": "%"},
        {"name": "Lucro Líquido", "value": "28500", "unit": "milhões de BRL"}
      ]
    }
    </INPUT FORMAT YOU WILL RECEIVE>

    <OUTPUT FORMAT>
    RESPONDA APENAS COM O SEGUINTE JSON, sem texto adicional:

    {
      "period": "string_ou_null",
      "revenue": number_ou_null,
      "ebitda": number_ou_null,
      "ebitdaMargin": number_ou_null,
      "netProfit": number_ou_null,
      "netMargin": number_ou_null,
      "netDebt": number_ou_null,
      "leverage": number_ou_null,
      "fco": number_ou_null,
      "capex": number_ou_null,
      "dividends": number_ou_null,
      "aiSensation": number_ou_null,
      "aiSummary": "string_ou_null",
      "projection": {
        "expectedRevenue": number_ou_null,
        "expectedNetProfit": number_ou_null,
        "expectedDividends": number_ou_null,
        "growthRate": number_ou_null
      } | null
    }
    </OUTPUT FORMAT>

    <INSTRUCTIONS>
    1. Analise o array extractedData para encontrar as métricas
    2. Se o valor estiver em milhões ou bilhões, converta para unidades (BRL)
    3. Calcule margens se só tiver valores absolutos
    4. Se não encontrar uma métrica, use null
    5. Gere aiSensation baseada no desempenho (0-10)
    6. Gere aiSummary com 1-2 frases sobre desempenho e perspectivas
    7. Crie projeções apenas se houver tendências claras
    </INSTRUCTIONS>
    `.trim();
  }

  /**
   * Constrói o prompt do usuário com os dados brutos.
   */
  private buildAnalysisUserPrompt(rawExtractionId: string, rawData: unknown): string {
    return `
    <RAW EXTRACTION DATA>
    ID: ${rawExtractionId}
    Data: ${JSON.stringify(rawData, null, 2)}
    </RAW EXTRACTION DATA>

    <TASK>
    Analise os dados acima e retorne o JSON processado conforme o formato definido no system prompt.

    1. Identifique o período baseado nos valores e contexto
    2. Converta valores de milhões/bilhões para unidades (BRL)
    3. Calcule margens se não estiverem presentes
    4. Gere aiSensation e aiSummary baseados no desempenho
    5. Crie projeções se houver tendências claras
    6. Use null para métricas que não podem ser determinadas
    </TASK>

    Agora retorne o JSON processado:
    `.trim();
  }
}
