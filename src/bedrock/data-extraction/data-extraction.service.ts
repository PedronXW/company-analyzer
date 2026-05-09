import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para a resposta de extração de dados financeiros da empresa.
 */
export interface DataExtractionResponse {

  referenceData: string | null;
  period: string | null;

  // Dados Fixos Extraídos (Métricas Financeiras)
  revenue: number | null; // Receita Líquida
  ebitda: number | null; // EBITDA
  ebitdaMargin: number | null; // Margem EBITDA (%)
  netProfit: number | null; // Lucro Líquido
  netMargin: number | null; // Margem Líquida (%)
  netDebt: number | null; // Dívida Líquida
  leverage: number | null; // Dívida Líquida / EBITDA (Alavancagem)
  fco: number | null; // Fluxo de Caixa Operacional
  capex: number | null; // Investimentos
  dividends: number | null; // Dividendos declarados no período

  // Inteligência da IA
  aiSensation: number | null; // Impacto pontual (0 a 10)
  aiSummary: string | null; // Resumo da tese da IA para o período
  projection: Record<string, unknown> | null; // Projeções para o próximo período
}

/**
 * Serviço especializado em extração de dados financeiros de empresas.
 *
 * Utiliza o modelo Amazon Nova Premier (amazon.nova-pro-v1:0) para:
 * - Identificar empresas mencionadas no documento
 * - Extrair métricas financeiras estruturadas
 * - Avaliar o nível de confiança da extração
 * - Gerar insights sobre o negócio da empresa
 *
 * Configurado com temperature 0 para determinismo total.
 */
@Injectable()
export class DataExtractionService {
  private readonly logger = new Logger(DataExtractionService.name);
  private readonly modelId = 'us.amazon.nova-pro-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('DataExtractionService initialized');
  }

  /**
   * Remove blocos de Markdown da resposta do modelo.
   *
   * Modelos LLM frequentemente retornam JSON dentro de blocos ```json...```.
   * Esta função remove esses wrappers para permitir parsing direto.
   *
   * @param text Texto bruto retornado pelo modelo
   * @returns Texto limpo, pronto para JSON.parse()
   */
  private cleanJsonResponse(text: string): string {
    return text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
  }

  /**
   * Valida se o objeto parseado possui a estrutura esperada.
   *
   * Type guard que verifica a presença de todos os campos obrigatórios
   * do schema DataExtractionResponse (mesmo que com valor null).
   *
   * @param data Objeto parseado da resposta do modelo
   * @returns true se o objeto é válido, false caso contrário
   */

  /**
   * Extrai dados financeiros de uma empresa usando Amazon Bedrock Nova Premier.
   *
   * Processo:
   * 1. Constrói o prompt de extração de dados financeiros
   * 2. Envia requisição ao Bedrock com temperature 0 e maxTokens 2048
   * 3. Limpa a resposta de blocos Markdown
   * 4. Valida a estrutura JSON retornada
   * 5. Retorna objeto tipado com dados financeiros da empresa
   *
   * Campos financeiros extraídos (conforme schema Analysis do Prisma):
   * - revenue: Receita Líquida
   * - ebitda: EBITDA
   * - ebitdaMargin: Margem EBITDA (%)
   * - netProfit: Lucro Líquido
   * - netMargin: Margem Líquida (%)
   * - netDebt: Dívida Líquida
   * - leverage: Dívida Líquida / EBITDA (Alavancagem)
   * - fco: Fluxo de Caixa Operacional
   * - capex: Investimentos
   * - dividends: Dividendos declarados
   * - aiSensation: Impacto pontual (0 a 10)
   * - aiSummary: Resumo da tese da IA
   * - projection: Projeções para o próximo período
   *
   * @param s3Uri URI do arquivo no S3 (ex: s3://bucket/attachments/fileId)
   * @returns Dados financeiros extraídos da empresa
   * @throws InternalServerErrorException em caso de erro na comunicação ou parsing
   *
   * @example
   * ```typescript
   * const result = await service.extractFinancialData('s3://my-bucket/attachments/abc123');
   * console.log(result.companyName); // 'Petrobras'
   * console.log(result.revenue); // 125000000000
   * console.log(result.netProfit); // 45000000000
   * ```
   */
  async extractFinancialData(
    s3Uri: string,
  ): Promise<DataExtractionResponse> {
    const systemPrompt = this.buildExtractionSystemPrompt();
    const userPrompt = this.buildExtractionUserPrompt(s3Uri);

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
        temperature: 0, // Determinismo total para extração de dados financeiros
        maxTokens: 2048,
      },
    };

    try {
      this.logger.debug(
        `Starting financial data extraction with S3 URI: ${s3Uri}`,
      );

      const client = this.bedrockService.getClient();
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await client.send(command);

      // Valida presença de conteúdo na resposta
      if (!response.output?.message?.content?.[0]) {
        throw new Error('Empty response from Bedrock');
      }

      const rawText = response.output.message.content[0].text;

      if (!rawText) {
        throw new Error('No text content in Bedrock response');
      }

      // Remove blocos markdown antes do parsing
      const cleanedText = this.cleanJsonResponse(rawText);

      this.logger.debug(`Raw response received (${cleanedText.length} chars)`);

      // Tenta fazer o parsing do JSON
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError) {
        this.logger.error(`JSON parse error: ${parseError}`, {
          rawResponse: cleanedText.substring(0, 500),
        });
        throw new Error(`Invalid JSON response from model: ${parseError}`);
      }

      // Valida a estrutura da resposta
      if (!this.isValidExtractionResponse(parsedData)) {
        this.logger.error('Invalid extraction response structure', {
          receivedFields: Object.keys(parsedData as object),
        });
        throw new Error(
          'Response does not match expected DataExtractionResponse structure',
        );
      }

      this.logger.log('Financial data extraction completed successfully');

      return parsedData;
    } catch (error) {
      this.logger.error(`Error extracting financial data: ${error}`);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Failed to extract financial data: ${error.message}`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to extract financial data from Bedrock',
      );
    }
  }

  /**
   * Constrói o prompt do sistema para extração de dados financeiros.
   *
   * @returns Prompt do sistema em formato XML
   */
  private buildExtractionSystemPrompt(): string {
    return `
    <system>
    <role>Analista Financeiro Especialista com IA</role>
    <instructions>
    <objective>Extrair métricas financeiras e informações estruturadas sobre a empresa a partir do documento fornecido</objective>
    <output_format>Retornar APENAS um objeto JSON válido, sem markdown, sem comentários</output_format>
    <financial_metrics>
    <metric name="revenue">Receita Líquida total do período</metric>
    <metric name="ebitda">EBITDA ajustado</metric>
    <metric name="ebitdaMargin">Margem EBITDA em porcentagem (ex: 25.5)</metric>
    <metric name="netProfit">Lucro Líquido total</metric>
    <metric name="netMargin">Margem Líquida em porcentagem</metric>
    <metric name="netDebt">Dívida Líquida (Dívida Bruta - Caixa)</metric>
    <metric name="leverage">Alavancagem: Dívida Líquida / EBITDA</metric>
    <metric name="fco">Fluxo de Caixa Operacional</metric>
    <metric name="capex">Investimentos em Capital (Capex)</metric>
    <metric name="dividends">Dividendos declarados no período</metric>
    </financial_metrics>
    <ai_insights>
    <insight name="aiSensation">Impacto pontual da empresa (0 a 10) baseado em desempenho financeiro</insight>
    <insight name="aiSummary">Resumo da tese de investimento da IA (até 500 caracteres)</insight>
    <insight name="projection">Projeções para o próximo período: { expectedRevenue, expectedNetProfit, expectedDividends }</insight>
    </ai_insights>
    <constraints>
    <constraint>Retornar APENAS o JSON, nada mais</constraint>
    <constraint>Use JSON válido, sem blocos markdown</constraint>
    <constraint>Se um dado não estiver claro no documento, use null e reduza confidence</constraint>
    <constraint>Valores monetários em números (ex: 125000000000), não strings</constraint>
    <constraint>Porcentagens como números (ex: 25.5 para 25.5%)</constraint>
    <constraint>aiSensation entre 0 e 10</constraint>
    <constraint>confidence entre 0.0 e 1.0</constraint>
    </constraints>
    </instructions>
    </system>
    `.trim();
  }

  /**
   * Constrói o prompt do usuário com o conteúdo do documento.
   *
   * @param s3Uri URI do arquivo no S3 (ex: s3://bucket/attachments/fileId)
   * @returns Prompt do usuário em formato XML
   */
  private buildExtractionUserPrompt(s3Uri: string): string {
    return `
    <user>
    <task>Analisar o seguinte documento financeiro e extrair dados estruturados sobre a empresa</task>
    <document>
    <s3_location>${s3Uri}</s3_location>
    <format>pdf</format>
    </document>
    <instruction>
    Extraia todas as métricas financeiras disponíveis e gere insights sobre a empresa.
    Se某些 dados não estiverem claros, use null e ajuste o confidence accordingly.
    Foque em dados financeiros recentes e relevantes para análise de investimento.
    </instruction>
    </user>
    `.trim();
  }
}