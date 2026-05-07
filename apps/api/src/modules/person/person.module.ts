import { Module, OnModuleInit } from '@nestjs/common';
import { PersonService } from './person.service';
import { PersonController } from './person.controller';
import { IdentityResolutionService } from './identity-resolution.service';
import { IdentityRuleController } from './identity-rule.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [PersonService, IdentityResolutionService],
  controllers: [PersonController, IdentityRuleController],
  exports: [PersonService, IdentityResolutionService],
})
export class PersonModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed default IdentityRules for tenants that don't have any. Runs once
   * at boot. Cheap idempotent upsert.
   */
  async onModuleInit() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const t of tenants) {
      const existing = await this.prisma.identityRule.count({ where: { tenantId: t.id } });
      if (existing > 0) continue;
      await this.prisma.identityRule.createMany({
        data: [
          { tenantId: t.id, name: '邮箱完全匹配', comparator: 'exact_email', priority: 10, surfaceOnly: false },
          { tenantId: t.id, name: '电话完全匹配', comparator: 'exact_phone', priority: 20, surfaceOnly: false },
          { tenantId: t.id, name: '同名+同邮箱域名', comparator: 'exact_name_email_domain', priority: 30, surfaceOnly: true },
          { tenantId: t.id, name: '近似姓名（编辑距离≤1）', comparator: 'fuzzy_name', priority: 40, surfaceOnly: true },
        ],
      });
    }
  }
}
