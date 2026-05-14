import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para a resposta de extração de dados financeiros.
 */
export interface RawExtractionData {
  extractedData: Array<{
    name: string;
    value: string;
    unit?: string;
  }>;
  metadata: {
    modelId: string;
    extractedAt: string;
  };
}

/**
 * Serviço especializado em extração BRUTA de dados financeiros de empresas.
 *
 * Estratégia: Prompt de texto direto com instruções claras para extrair qualquer
 * dado financeiro ou estrutural do documento. O modelo retorna JSON no texto da resposta.
 *
 * Suporte a seções: É possível indicar qual seção do documento focar no prompt.
 * Isso permite processar o mesmo PDF em diferentes seções sem precisar dividir o arquivo.
 */
@Injectable()
export class DataExtractionService {
  private readonly logger = new Logger(DataExtractionService.name);
  private readonly modelId = 'us.amazon.nova-2-lite-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('DataExtractionService initialized');
  }

  /**
   * Remove blocos de Markdown e extrai JSON da resposta do modelo.
   * Tenta consertar JSON truncado (strings sem fechamento, arrays sem fechamento).
   */
  private cleanJsonResponse(text: string): string {
    // Remove blocos markdown
    let cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/```/g, '')
      .trim();

    // Tenta extrair o JSON - buscar pelo primeiro { e correspondente }
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) {
      return cleaned;
    }

    // Contar chaves para achar o fechamento correto
    let depth = 0;
    let lastValidEnd = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          lastValidEnd = i + 1;
        }
      }
    }

    // Se achou o fechamento, usar até lá
    if (lastValidEnd > 0) {
      cleaned = cleaned.substring(firstBrace, lastValidEnd);
      return cleaned.trim();
    }

    // Se não achou fechamento, tentar consertar JSON truncado
    const truncated = cleaned.substring(firstBrace);
    const fixed = this.fixTruncatedJson(truncated);
    if (fixed) {
      return fixed;
    }

    return cleaned;
  }

  /**
   * Tenta consertar JSON truncado adicionando fechamentos faltantes.
   * Foca em fechar objetos individuais dentro do array extractedData.
   */
  private fixTruncatedJson(json: string): string | null {
    if (!json) return null;

    // Tenta encontrar o último objeto completo ou parcial
    // Procura por padrões de objetos truncados: {"name": "...", "value": "...", "unit": "..."
    const lastIncompleteObject = json.match(/{"name":\s*"[^"]*"\s*,\s*"value":\s*"[^"]*"(?:\s*,\s*"unit":\s*"[^"]*")?\s*$/);

    if (lastIncompleteObject) {
      const lastMatch = lastIncompleteObject[0];
      // Encontrar onde esse objeto começa no JSON
      const lastObjStart = json.lastIndexOf(lastMatch);
      if (lastObjStart > -1) {
        // Pegar o JSON antes do objeto truncado
        const jsonBefore = json.substring(0, lastObjStart);

        // Contar fechamentos necessários (apenas brackets para arrays)
        let openBracketsBefore = (jsonBefore.match(/\[/g) || []).length;
        let closeBracketsBefore = (jsonBefore.match(/\]/g) || []).length;

        let fixed = jsonBefore.trim();

        // Fechar o array se necessário
        while (openBracketsBefore > closeBracketsBefore) {
          fixed += '\n    ],';
          closeBracketsBefore++;
        }

        // Fechar o objeto anterior se houver uma vírgula pendente
        if (fixed.endsWith(',')) {
          fixed = fixed.slice(0, -1);
        }
        fixed += '\n  }';

        return fixed;
      }
    }

    // Fallback mais agressivo: tentar fechar o que está aberto
    const openBracesCount = (json.match(/{/g) || []).length;
    const closeBracesCount = (json.match(/}/g) || []).length;
    const openBracketsCount = (json.match(/\[/g) || []).length;
    const closeBracketsCount = (json.match(/\]/g) || []).length;

    if (openBracesCount > closeBracesCount || openBracketsCount > closeBracketsCount) {
      let fixed = json;
      let currentOpenBraces = closeBracesCount;
      let currentOpenBrackets = closeBracketsCount;

      // Fechar objetos primeiro (mais profundos)
      while (openBracesCount > currentOpenBraces) {
        fixed += '}';
        currentOpenBraces++;
      }
      // Fechar arrays
      while (openBracketsCount > currentOpenBrackets) {
        fixed += ']';
        currentOpenBrackets++;
      }
      return fixed;
    }

    return null;
  }

  /**
   * Extrai dados financeiros BRUTOS de uma empresa usando Amazon Bedrock Nova 2 Lite.
   *
   * @param s3Uri URI do arquivo no S3 (ex: s3://bucket/attachments/fileId)
   * @param sectionName Opcional: nome da seção específica a ser analisada
   * @returns Dados brutos extraídos da empresa (formato JSON no texto)
   */
  async extractFinancialData(s3Uri: string, sectionName?: string): Promise<RawExtractionData> {
    const systemPrompt = this.buildExtractionSystemPrompt(sectionName);
    const userPrompt = this.buildExtractionUserPrompt(s3Uri, sectionName);

    const result = await this.tryExtractFinancialData(s3Uri, systemPrompt, userPrompt);

    if (result) {
      return result;
    }

    // Fallback: tentar com prompt mais simples se o primeiro falhar
    this.logger.warn('Retrying extraction with simplified prompt');
    const simplifiedSystemPrompt = this.buildSimplifiedSystemPrompt(sectionName);
    const simplifiedUserPrompt = this.buildSimplifiedUserPrompt(s3Uri, sectionName);
    const fallbackResult = await this.tryExtractFinancialData(s3Uri, simplifiedSystemPrompt, simplifiedUserPrompt);

    if (fallbackResult) {
      return fallbackResult;
    }

    throw new Error('Failed to extract financial data after retry');
  }

  /**
   * Tenta extrair dados financeiros com os prompts fornecidos.
   * Retorna null se falhar, ou o resultado se bem-sucedido.
   */
  private async tryExtractFinancialData(
    s3Uri: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<RawExtractionData | null> {
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
        // Usando 8192 para não exceder o limite do modelo
        maxTokens: 8192,
      },
    };

    try {
      this.logger.debug(
        `Starting raw financial data extraction with S3 URI: ${s3Uri}`,
      );

      const client = this.bedrockService.getClient();
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await client.send(command);

      this.logger.debug(`Bedrock stopReason: ${response.stopReason}`);

      // Detecta se a resposta foi truncada por max_tokens
      const isTruncated = response.stopReason === 'max_tokens';
      if (isTruncated) {
        this.logger.warn('Response was truncated by max_tokens limit');
      }

      // Valida presença de conteúdo na resposta
      if (!response.output?.message?.content?.[0]) {
        this.logger.warn('Empty response from Bedrock');
        return null;
      }

      const rawText = response.output.message.content?.[0]?.text || '';

      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn('No text content in Bedrock response');
        return null;
      }

      this.logger.debug(`Raw response received (${rawText.length} chars)`);

      // Remove blocos markdown antes do parsing
      const cleanedText = this.cleanJsonResponse(rawText);
      this.logger.debug(`Cleaned response (${cleanedText.length} chars)`);

      // Tenta fazer o parsing do JSON
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError) {
        this.logger.error(`JSON parse error: ${parseError}`, {
          rawResponse: cleanedText.substring(0, 500),
        });
        return null;
      }

      const result = parsedData as {
        extractedData?: Array<{ name: string; value: string; unit?: string }>;
      };

      this.logger.log('Raw financial data extraction completed successfully');

      return {
        extractedData: result.extractedData || [],
        metadata: {
          modelId: this.modelId,
          extractedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Error extracting raw financial data: ${error}`);

      return null;
    }
  }

  /**
   * Constrói o prompt do sistema para extração BRUTA de dados financeiros.
   * Foco: extrair TODOS os dados existentes no documento - sem limitação de campos.
   */
  private buildExtractionSystemPrompt(sectionName?: string): string {
    let prompt = `
    Você é um Analista Financeiro Senior com acesso a um documento corporativo completo.
    Sua tarefa é extrair TODOS os dados financeiros e estruturais disponíveis no documento.

    <OBJECTIVE>
    1. EXTRIA TODOS os dados encontrados - não limite a campos específicos
    2. Identifique e extraia métricas, KPIs, indicadores financeiros
    3. Capture valores numéricos com suas respectivas unidades
    4. Inclua TODOS os dados relevantes - não omita nada
    </OBJECTIVE>
    `;

    if (sectionName) {
      prompt += `
      <FOCO DA EXTRAÇÃO>
      Você deve focar NA SEÇÃO "${sectionName}" DO DOCUMENTO.
      Extraia TODOS os dados relevantes desta seção específica.
      Não ignore nenhum dado - extraia tudo que for possível.
      </FOCO DA EXTRAÇÃO>
      `;
    }

    prompt += `
    IMPORTANTE: Extraia TODOS os dados existentes - não há limite de campos.
    Retorne APENAS o seguinte formato JSON, sem texto adicional:
    {"extractedData":[{"name":"Nome","value":"Valor","unit":"Unidade"}]}

    - Use o valor EXATO como aparece no documento (inclusive formatos como "1,234.56")
    - Inclua TODOS os dados encontrados - não omita nenhum
    - Se um dado não tiver unidade, use unit: null ou omita o campo unit
    - NÃO repita campos já extraídos
    - Se houver múltiplos valores para o mesmo indicador (ex:ano a ano), extraia todos
    `.trim();

    return prompt;
  }

  /**
   * Constrói o prompt do usuário com o conteúdo do documento.
   */
  private buildExtractionUserPrompt(s3Uri: string, sectionName?: string): string {
    let prompt = `
    Process the document at ${s3Uri} and extract ALL financial and structural data.

    <TASK>
    1. Leia o documento COMPLETO
    2. Identifique TODAS as métricas, KPIs e dados financeiros
    3. Extraia TODOS os valores numéricos com suas unidades
    4. Não limite a campos específicos - extraia tudo que for possível
    </TASK>

    Return ONLY the JSON format as specified in the system prompt.
    `;

    if (sectionName) {
      prompt += `
      <SEÇÃO ESPECÍFICA>
      Process the "${sectionName}" section of the document.
      Extract ALL data from this section - do not omit anything.
      </SEÇÃO ESPECÍFICA>
      `;
    }

    return prompt.trim();
  }

  /**
   * Prompt do sistema simplificado para fallback quando o principal falha.
   * Foco: extrair todos os dados essenciais sem limitação.
   */
  private buildSimplifiedSystemPrompt(sectionName?: string): string {
    let prompt = `
    Você é um Analista Financeiro Senior com acesso a um documento corporativo completo.
    Sua tarefa é extrair TODOS os dados financeiros disponíveis no documento.

    <OBJECTIVE>
    1. EXTRIA TODOS os dados encontrados - não limite a campos específicos
    2. Identifique e extraia métricas, KPIs, indicadores financeiros
    3. Capture valores numéricos com suas respectivas unidades
    4. Inclua TODOS os dados relevantes - não omita nada
    </OBJECTIVE>
    `;

    if (sectionName) {
      prompt += `
      <FOCO DA EXTRAÇÃO>
      Você deve focar NA SEÇÃO "${sectionName}" DO DOCUMENTO.
      Extraia TODOS os dados relevantes desta seção específica.
      Não ignore nenhum dado - extraia tudo que for possível.
      </FOCO DA EXTRAÇÃO>
      `;
    }

    prompt += `
    IMPORTANTE: Extraia TODOS os dados existentes - não há limite de campos.
    Retorne APENAS o seguinte formato JSON, sem texto adicional:
    {"extractedData":[{"name":"Nome","value":"Valor","unit":"Unidade"}]}

    - Use o valor EXATO como aparece no documento
    - Inclua TODOS os dados encontrados - não omita nenhum
    - Se um dado não tiver unidade, use unit: null ou omita o campo unit
    - NÃO repita campos já extraídos
    `.trim();

    return prompt;
  }

  /**
   * Prompt do usuário simplificado para fallback.
   */
  private buildSimplifiedUserPrompt(s3Uri: string, sectionName?: string): string {
    let prompt = `
    Process the document at ${s3Uri} and extract ALL available financial data.

    <TASK>
    1. Leia o documento COMPLETO
    2. Extraia TODOS os dados financeiros e estruturais
    3. Não limite a campos específicos - extraia tudo que for possível
    </TASK>

    Return ONLY the JSON format as specified in the system prompt.
    `;

    if (sectionName) {
      prompt += `
      <SEÇÃO ESPECÍFICA>
      Process the "${sectionName}" section of the document.
      Extract ALL data from this section - do not omit anything.
      </SEÇÃO ESPECÍFICA>
      `;
    }

    return prompt.trim();
  }
}
