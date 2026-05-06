import { FileUploadService } from '@/jobs/file-upload.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Serviço de upload de arquivos.
 *
 * Arquitetura: Application Layer (UploadService)
 * Responsável pelo upload para S3 e notificar o FileUploadService
 * para adicionar jobs à fila de processamento.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client | null = null;

  constructor(
    private prisma: PrismaService,
    private fileUploadService: FileUploadService,
  ) {
    this.initializeS3();
  }

  private initializeS3() {
    const minioUrl = process.env.MINIO_URL;
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    // Só inicializa o S3Client se tiver todas as configurações
    if (minioUrl && s3Bucket && s3Region && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        endpoint: minioUrl,
        region: s3Region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        // MinIO usa path-style addressing por padrão
        forcePathStyle: true,
      });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ id: string }> {
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;

    const id = randomUUID();

    // Upload para S3 (MinIO como mock)
    if (this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: id,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);
    }

    // Criar metadados do arquivo com status 'pending'
    const uploadedFile = await this.prisma.file.create({
      data: {
        id,
        filename: file.originalname,
        type: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        processedAt: null,
        status: 'pending',
      },
    });

    this.logger.log(`Arquivo ${file.originalname} enviado para S3`);

    // Adicionar job à fila para processamento assíncrono
    await this.fileUploadService.queueProcessing(
      uploadedFile.id,
      uploadedFile.filename,
    );

    return {
      id: uploadedFile.id,
    };
  }
}
