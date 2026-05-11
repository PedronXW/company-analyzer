import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post
} from '@nestjs/common';
import { createSignalSchema } from './dto/create-signal.schema';
import type { CreateSignalDto } from './dto/create-signal.schema';
import { SignalsService } from './signals.service';

/**
 * SignalsController
 *
 * Recebe Signals do news-analyzer e os persiste no banco de dados.
 *
 * Endpoints:
 * - POST /signals: Recebe e processa um novo Signal
 */
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) { }

  /**
   * Recebe um Signal do news-analyzer.
   *
   * @param dto - CreateSignalDto com ticker, source, score e reasoning
   * @returns Signal criado
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: CreateSignalDto): Promise<CreateSignalDto & { id: string; processed: boolean }> {
    // Validar o DTO
    const validated = createSignalSchema.parse(dto);

    return this.signalsService.createSignal(validated);
  }
}
