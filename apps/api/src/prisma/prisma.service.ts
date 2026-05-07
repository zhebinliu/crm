import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardMiddleware } from './tenant-guard';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    // Hard tenant-isolation guard. Throws if any query against a tenant-
    // scoped model omits tenantId in its where/data. Bypass with the env
    // TENANT_GUARD_DISABLED=true (only for unit tests with mock client).
    if (process.env.TENANT_GUARD_DISABLED !== 'true') {
      this.$use(tenantGuardMiddleware());
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.log.log('Prisma connected (tenant-guard active)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
