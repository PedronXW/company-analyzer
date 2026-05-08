import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

interface CreateCompanyDto {
  ticker: string;
  name: string;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private prisma: PrismaService) {}

  async createCompany({ ticker, name }: CreateCompanyDto): Promise<{ id: string }> {
    const existingCompany = await this.prisma.company.findUnique({
      where: { ticker },
    });

    if (existingCompany) {
      this.logger.warn(`Empresa com ticker "${ticker}" já existe`);
      throw new Error(`Empresa com ticker "${ticker}" já existe`);
    }

    const company = await this.prisma.company.create({
      data: {
        ticker,
        name,
      },
      select: {
        id: true,
        ticker: true,
        name: true,
        createdAt: true,
      },
    });

    this.logger.log(`Empresa "${name}" (${ticker}) criada com ID: ${company.id}`);

    return { id: company.id };
  }
}
