import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async emit(tenantId: string, eventType: string, recordType: string, recordId: string, payload: unknown) {
    await this.prisma.outboxEvent.create({
      data: { tenantId, eventType, recordType, recordId, payload: payload as object },
    });
  }
}
