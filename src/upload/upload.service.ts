import { PrismaService } from '@/prisma/prisma.service';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client;

  constructor(private prisma: PrismaService) {
    this.initializeS3();
  }

  private initializeS3() {
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;

    if (s3Bucket && s3Region) {
      this.s3Client = new S3Client({
        region: s3Region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ id: string }> {
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;

    if (!s3Bucket || !s3Region || !this.s3Client) {
      throw new Error('S3 configuration not found');
    }

    const id = randomUUID()

    // Upload para S3
    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: id,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    const result = await this.s3Client.send(command);

    // Criar metadados do arquivo
    const uploadedFile = await this.prisma.file.create({
      data: {
        id,
        filename: file.filename,
        type: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        processedAt: new Date(),
        status: 'processed',
      },
    });

    this.logger.log(`Arquivo ${file.originalname} enviado para S3`);

    return {
      id: uploadedFile.id,
    };
  }

}
