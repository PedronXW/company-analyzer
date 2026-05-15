import { ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BedrockService } from '../bedrock.service';

/**
 * Interface para a resposta de extração de período.
 */
export interface PeriodExtractionResult {
  period: string; // Ex: "1T26", "4T25", "Ano fiscal 2024"
  confidence: number; // 0-100
}

/**
 * Serviço para extrair o período de um documento usando LLM.
 *
 * Estratégia:
 * 1. Envia o PDF ou texto para o Bedrock
 * 2. Pede para identificar o período (trimestre/ano)
 * 3. Retorna o período formatado e confidence
 */
@Injectable()
export class PeriodExtractionService {
  private readonly logger = new Logger(PeriodExtractionService.name);
  private readonly modelId = 'us.amazon.nova-2-lite-v1:0';

  constructor(private readonly bedrockService: BedrockService) {
    this.logger.log('PeriodExtractionService initialized');
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
   * Extrai o período de um documento.
   *
   * @param s3Uri URI do arquivo no S3
   * @returns O período formatado e confidence
   */
  async extractPeriod(s3Uri: string): Promise<PeriodExtractionResult> {
    const systemPrompt = this.buildExtractionSystemPrompt();
    const userPrompt = this.buildExtractionUserPrompt(s3Uri);

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
        maxTokens: 1024,
      },
    };

    try {
      this.logger.log(`Starting period extraction for: ${s3Uri}`);

      const client = this.bedrockService.getClient();
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await client.send(command);

      if (!response.output?.message?.content?.[0]) {
        throw new Error('Empty response from Bedrock');
      }

      const rawText = response.output.message.content?.[0]?.text || '';
      this.logger.debug(`Raw period extraction response received (${rawText.length} chars)`);

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
        period: string;
        confidence: number;
      };

      this.logger.log(`Period extraction completed: ${result.period} (confidence: ${result.confidence}%)`);

      return {
        period: result.period,
        confidence: result.confidence,
      };
    } catch (error) {
      this.logger.error(`Error extracting period: ${error}`);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Failed to extract period: ${error.message}`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to extract period from Bedrock',
      );
    }
  }

  /**
   * Constrói o prompt do sistema para extração de período.
   */
  private buildExtractionSystemPrompt(): string {
    return `
    Você é um Analista Financeiro Senior que recebe documentos corporativos.
    Sua tarefa é IDENTIFICAR EXATAMENTE o período ao qual o documento se refere.

    <OBJECTIVE>
    Analise o documento e:
    1. IDENTIFIQUE o trimestre (1, 2, 3, 4)
    2. IDENTIFIQUE o ano (2 dígitos, ex: 26 para 2026)
    3. Determine o período no formato "XTYY" (ex: 1T26, 4T25)
    </OBJECTIVE>

    <FORMATO DE SAÍDA ESPERADO>
    trimestre/ano:
    - 1T26 = 1º trimestre de 2026
    - 2T25 = 2º trimestre de 2025
    - 4T24 = 4º trimestre de 2024
    - Ano fiscal 2024 = FY24 (se não houver trimestre)
    </FORMATO DE SAÍDA ESPERADO>

    <INSTRUCTIONS>
    1. Procure por frases como:
       - "1º trimestre de 2026", "1T26", "Q1 2026"
       - "12 meses de 2025", "Ano fiscal 2025"
       - "Janeiro a Março de 2026"
    2. Se houver ambiguidade, escolha o mais recente
    3. Se não for possível determinar, retorne "N/D" com baixa confiança
    4. A confiança deve refletir quão claro o período está no documento
    5. Considere o contexto do documento (capa, data de publicação, etc.)
    </INSTRUCTIONS>

    <OUTPUT FORMAT>
    RESPONDA APENAS COM O SEGUINTE JSON, sem texto adicional:

    {
      "period": "string no formato XTYY ou FYXX",
      "confidence": number entre 0 e 100
    }

    EXEMPLOS:
    - { "period": "1T26", "confidence": 95 }
    - { "period": "4T25", "confidence": 100 }
    - { "period": "N/D", "confidence": 30 }
    </OUTPUT FORMAT>
    `.trim();
  }

  /**
   * Constrói o prompt do usuário com o conteúdo do documento.
   */
  private buildExtractionUserPrompt(s3Uri: string): string {
    return `
    Extract the period from the document at ${s3Uri}.

    <YOUR TASK>
    1. LEIA CUIDADOSAMENTE todo o documento
    2. IDENTIFIQUE o período financeiro (trimestre/ano)
    3. RETORNE o período no formato exigido
    4. AVALIE sua confiança na extração
    </YOUR TASK>

    <RETURN FORMAT>
    ONLY the JSON format as specified in the system prompt.
    NO additional text, explanations, or markdown formatting.
    </RETURN FORMAT>
    `.trim();
  }
}
