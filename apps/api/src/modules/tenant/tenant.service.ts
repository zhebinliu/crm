import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string) {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tenant not found' });
    return t;
  }

  updateSettings(id: string, settings: Record<string, unknown>) {
    return this.prisma.tenant.update({
      where: { id },
      data: { settings: settings as object },
    });
  }
}
