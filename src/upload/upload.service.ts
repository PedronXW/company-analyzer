import { FILE_UPLOAD_QUEUE } from '@/prisma/prisma.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
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
    @InjectQueue(FILE_UPLOAD_QUEUE)
    private readonly uploadQueue: Queue,
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
    companyId: string,
  ): Promise<{ id: string }> {

    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId
      }
    })

    if (!company) {
      throw new Error("Company not found")
    }

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
        companyId,
      },
    });

    this.logger.log(`Arquivo ${file.originalname} enviado para S3`);

    await this.uploadQueue.add('company/upload', {
      fileId: uploadedFile.id
    });

    return {
      id: uploadedFile.id,
    };
  }
}
