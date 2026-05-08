import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) { }

  @Post(':companyId/file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('companyId') companyId: string,
  ): Promise<any> {
    try {
      const result = await this.uploadService.uploadFile(file, companyId);
      return {
        success: true,
        message: 'Arquivo enviado com sucesso',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Erro ao enviar arquivo',
        error: error.message,
      };
    }
  }
}
