import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateEmailTemplateDto {
  name: string;
  subject: string;
  body: string;
  category?: string;
  isActive?: boolean;
}

interface UpdateEmailTemplateDto {
  name?: string;
  subject?: string;
  body?: string;
  category?: string;
  isActive?: boolean;
}

interface ListQuery {
  search?: string;
  category?: string;
}

@Injectable()
export class EmailTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListQuery = {}) {
    const { search, category } = query;
    return this.prisma.emailTemplate.findMany({
      where: {
        tenantId,
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) throw new NotFoundException(`Email template ${id} not found`);
    return template;
  }

  async create(tenantId: string, data: CreateEmailTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        tenantId,
        name: data.name,
        subject: data.subject,
        body: data.body,
        category: data.category,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, data: UpdateEmailTemplateDto) {
    await this.get(tenantId, id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.emailTemplate.delete({ where: { id } });
  }
}
