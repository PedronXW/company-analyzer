import { Body, Controller, Post } from '@nestjs/common';
import { CompanyService } from './company.service';

interface CreateCompanyDto {
  ticker: string;
  name: string;
}

@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Post()
  async createCompany(@Body() dto: CreateCompanyDto): Promise<any> {
    try {
      const result = await this.companyService.createCompany(dto);
      return {
        success: true,
        message: 'Empresa criada com sucesso',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Erro ao criar empresa',
        error: error.message,
      };
    }
  }
}
