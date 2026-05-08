import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Serviço base para integração com Amazon Bedrock.
 *
 * Responsável por:
 * - Inicializar o cliente BedrockRuntimeClient com credenciais AWS
 * - Fornecer acesso centralizado ao cliente para serviços especializados
 * - Gerenciar configurações globais de Bedrock (região, credenciais, etc.)
 *
 * Este serviço não executa análises diretamente.
 * Análises específicas devem ser implementadas em serviços dedicados
 * dentro de suas respectivas pastas (ex: company-identification/).
 */
@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly config: BedrockConfig;

  constructor(private readonly configService: ConfigService) {
    // Carrega configuração do AWS a partir das variáveis de ambiente
    this.config = {
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.getOrThrow<string>(
        'AWS_SECRET_ACCESS_KEY',
      ),
    };

    // Inicializa o cliente Bedrock com credenciais explícitas
    this.client = new BedrockRuntimeClient({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });

    this.logger.log(
      `BedrockService initialized with region: ${this.config.region}`,
    );
  }

  /**
   * Retorna o cliente BedrockRuntimeClient configurado.
   * Usar este método em serviços especializados que precisam fazer chamadas ao Bedrock.
   *
   * @returns Cliente configurado para comunicação com Bedrock
   */
  getClient(): BedrockRuntimeClient {
    return this.client;
  }

  /**
   * Retorna a configuração atual do Bedrock (região, credenciais).
   * Útil para logging e debugging.
   *
   * @returns Configuração do Bedrock (sem expor secrets em logs)
   */
  getConfig(): Readonly<Omit<BedrockConfig, 'secretAccessKey'>> {
    return {
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
    };
  }
}
