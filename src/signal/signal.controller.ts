import { Controller, Post, Body, Headers } from '@nestjs/common';
import { SignalService } from './signal.service';

interface FundamentalSignal {
  ticker: string;
  peRatio?: number;
  pbRatio?: number;
  debtToEquity?: number;
  revenueGrowth?: number;
  timestamp?: string;
}

@Controller('fundamentals')
export class SignalController {
  constructor(private readonly signalService: SignalService) {}

  @Post('signal')
  async createSignal(
    @Body() signal: FundamentalSignal,
    @Headers('x-reasoning') reasoning?: string,
  ) {
    return this.signalService.processFundamentalSignal(signal, reasoning);
  }
}
