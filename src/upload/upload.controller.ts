import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<void> {
    try {
      const result = await this.uploadService.uploadFile(file);
      res.json({
        success: true,
        message: 'Arquivo enviado com sucesso',
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar arquivo',
        error: error.message,
      });
    }
  }
}
