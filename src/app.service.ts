import { Service } from '@nestjs/common';

@Service()
export class AppService {
  getHello(): string {
    return 'Company Analyzer API is running on port 3002';
  }
}
