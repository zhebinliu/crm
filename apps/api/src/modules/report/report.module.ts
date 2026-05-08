// ─── ReportModule — SF-style Reports + Dashboards (Wave 19a) ───────────────
//
// On boot, seeds standard ReportTypes per active tenant (idempotent):
//   - "leads" (base: lead)
//   - "opportunities_with_account" (base: opportunity, join: account)
//   - "cases_with_contact" (base: case, joins: contact, account)
//
// NOTE: Wiring TODO — this module is NOT yet imported in apps/api/src/app.module.ts.
//       The orchestrator should add it to AppModule.imports.

import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportService } from './report.service';
import { DashboardService } from './dashboard.service';
import { ReportController } from './report.controller';
import { DashboardController } from './dashboard.controller';

@Module({
  providers: [ReportService, DashboardService],
  controllers: [ReportController, DashboardController],
  exports: [ReportService, DashboardService],
})
export class ReportModule implements OnModuleInit {
  private readonly log = new Logger(ReportModule.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      });
      let totalSeeded = 0;
      for (const t of tenants) {
        const n = await this.reports.seedStandardReportTypes(t.id);
        if (n > 0) {
          this.log.log(`Seeded ${n} standard ReportType(s) for tenant ${t.slug}`);
          totalSeeded += n;
        }
      }
      this.log.log(
        `ReportModule ready (tenants=${tenants.length}, seeded=${totalSeeded})`,
      );
    } catch (e) {
      // Don't crash app boot on seed failure.
      this.log.warn(
        `Standard report-type seed skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
