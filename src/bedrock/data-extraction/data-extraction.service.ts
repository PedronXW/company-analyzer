import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para a resposta de identificação de empresa.
 */
export interface CompanyIdentificationResponse {
  companyId: string;
  companyName: string;
  companyType: string;
  confidence: number;
  sector: string;
  description: string;
}

/**
 * Serviço especializado em identificação de empresas em documentos.
 *
 * Utiliza o modelo Amazon Nova Premier (amazon.nova-pro-v1:0) para:
 * - Identificar empresas mencionadas no documento
 * - Determinar o tipo de empresa (ex: Energia, Mineração, Alimentícios)
 * - Avaliar o nível de confiança da identificação
 * - Extrair descrição do negócio da empresa
 *
 * Configurado com temperature 0 para determinismo total.
 */
@Injectable()
export class CompanyIdentificationService {
  private readonly logger = new Logger(CompanyIdentificationService.name);
  private readonly modelId = 'us.amazon.nova-pro-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('CompanyIdentificationService initialized');
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
   * do schema CompanyIdentificationResponse (mesmo que com valor null).
   *
   * @param data Objeto parseado da resposta do modelo
   * @returns true se o objeto é válido, false caso contrário
   */
  private isValidIdentificationResponse(
    data: unknown,
  ): data is CompanyIdentificationResponse {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const response = data as Record<string, unknown>;

    const requiredFields: Array<keyof CompanyIdentificationResponse> = [
      'companyId',
      'companyName',
      'companyType',
      'confidence',
      'sector',
      'description',
    ];

    return requiredFields.every((field) => field in response);
  }

  /**
   * Identifica empresas em um documento usando Amazon Bedrock Nova Premier.
   *
   * Processo:
   * 1. Constrói o prompt de identificação de empresas
   * 2. Envia requisição ao Bedrock com temperature 0 e maxTokens 2048
   * 3. Limpa a resposta de blocos Markdown
   * 4. Valida a estrutura JSON retornada
   * 5. Retorna objeto tipado com dados da empresa identificada
   *
   * Campos retornados:
   * - companyId: ID único da empresa identificada
   * - companyName: Nome da empresa
   * - companyType: Tipo de empresa (ex: Energia, Mineração, Alimentícios)
   * - confidence: Nível de confiança (0.0 - 1.0)
   * - sector: Setor de atuação da empresa
   * - description: Descrição do negócio da empresa
   *
   * @param s3Uri URI do arquivo no S3 (ex: s3://bucket/attachments/fileId)
   * @returns Dados da empresa identificada
   * @throws InternalServerErrorException em caso de erro na comunicação ou parsing
   *
   * @example
   * ```typescript
   * const result = await service.identifyCompany('s3://my-bucket/attachments/abc123');
   * console.log(result.companyName); // 'Petrobras'
   * console.log(result.companyType); // 'Energia'
   * console.log(result.confidence); // 0.95
   * ```
   */
  async identifyCompany(
    s3Uri: string,
  ): Promise<CompanyIdentificationResponse> {
    const systemPrompt = this.buildIdentificationSystemPrompt();
    const userPrompt = this.buildIdentificationUserPrompt(s3Uri);

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
        temperature: 0, // Determinismo total para identificação de empresas
        maxTokens: 2048,
      },
    };

    try {
      this.logger.debug(
        `Starting company identification with S3 URI: ${s3Uri}`,
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
      if (!this.isValidIdentificationResponse(parsedData)) {
        this.logger.error('Invalid identification response structure', {
          receivedFields: Object.keys(parsedData as object),
        });
        throw new Error(
          'Response does not match expected CompanyIdentificationResponse structure',
        );
      }

      this.logger.log('Company identification completed successfully');

      return parsedData;
    } catch (error) {
      this.logger.error(`Error identifying company: ${error}`);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Failed to identify company: ${error.message}`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to identify company from Bedrock',
      );
    }
  }

  /**
   * Constrói o prompt do sistema para identificação de empresas.
   *
   * @returns Prompt do sistema em formato XML
   */
  private buildIdentificationSystemPrompt(): string {
    return `
    <system>
    <role>Identificador de Empresas Especialista</role>
    <instructions>
    <objective>Identificar a empresa principal mencionada no documento e extrair informações estruturadas sobre ela</objective>
    <output_format>Retornar APENAS um objeto JSON válido, sem markdown, sem comentários</output_format>
    <fields>
    <field name="companyId">Gere um ID único baseado no nome da empresa (ex: petrobras-energia)</field>
    <field name="companyName">Nome completo da empresa</field>
    <field name="companyType">Tipo de empresa: Energia, Mineração, Alimentícios, Tech, Macro, Financeiro, Varejo, Infraestrutura, Saúde, Educação, etc.</field>
    <field name="confidence">Nível de confiança entre 0.0 e 1.0</field>
    <field name="sector">Setor de atuação (ex: Petróleo e Gás, Mineração de Ferro, Tecnologia Financeira)</field>
    <field name="description">Descrição breve do negócio da empresa (até 200 caracteres)</field>
    </fields>
    <constraints>
    <constraint>Retornar APENAS o JSON, nada mais</constraint>
    <constraint>Use JSON válido, sem blocos markdown</constraint>
    <constraint>Não invente dados - se não estiver claro, use null ou confidence baixo</constraint>
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
  private buildIdentificationUserPrompt(s3Uri: string): string {
    return `
    <user>
    <task>Analisar o seguinte documento e identificar a empresa principal</task>
    <document>
    <s3_location>${s3Uri}</s3_location>
    <format>pdf</format>
    </document>
    <instruction>Extraia informações sobre a empresa mencionada e retorne no formato JSON especificado</instruction>
    </user>
    `.trim();
  }
}
