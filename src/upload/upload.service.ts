import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
  ): Promise<{ id: string; url: string }> {
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;

    if (!s3Bucket || !s3Region || !this.s3Client) {
      throw new Error('S3 configuration not found');
    }

    // Upload para S3
    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: file.originalname,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    const result = await this.s3Client.send(command);

    // Salvar metadados no banco
    const uploadedFile = await this.prisma.uploadedFile.create({
      data: {
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        s3Key: result.Key,
        s3Bucket: s3Bucket,
        s3Region: s3Region,
        status: 'processed',
      },
    });

    this.logger.log(`Arquivo ${file.originalname} enviado para S3: ${result.Location}`);

    return {
      id: uploadedFile.id,
      url: result.Location,
    };
  }
}
