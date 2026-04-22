import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const now = new Date().toISOString();
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      db = e instanceof Error ? `error: ${e.message}` : 'error';
    }
    return { status: 'ok', time: now, db };
  }
}
