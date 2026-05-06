import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Infraestrutura
import { PrismaModule } from './prisma/prisma.module';

// Upload Module
import { UploadModule } from './upload/upload.module';

/**
 * Módulo principal da aplicação Company Analyzer.
 *
 * Arquitetura:
 * - Separação em camadas: Application Layer / Infrastructure Layer
 * - Filas BullMQ para processamento assíncrono de uploads
 * - Amazon S3 para armazenamento de arquivos
 * - ONTOLOGIA DINÂMICA DE EVENTOS
 */
@Module({
  imports: [
    // Configuração global
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // BullMQ (filas)
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6380'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
        },
      }),
    }),

    // Infraestrutura
    PrismaModule,

    // Upload Module (Application Layer + Infrastructure Layer)
    UploadModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
