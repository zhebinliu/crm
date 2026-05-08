// ─── DashboardService — SF-style Dashboards (Wave 19a) ──────────────────────
//
// A Dashboard is a grid of components, each component pointing at a saved
// ReportDef plus a chosen visualization (table | bar | line | pie | metric |
// donut). `runDashboard` executes every component's underlying report and
// returns a map of ReportResult keyed by componentId — the front-end then
// renders charts from that.

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportService,
  type RunReportResult,
} from './report.service';

export type Visualization = 'table' | 'bar' | 'line' | 'pie' | 'metric' | 'donut';

@Injectable()
export class DashboardService {
  private readonly log = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportService,
  ) {}

  // ── Dashboard CRUD ────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    ownerId: string,
    dto: {
      name: string;
      description?: string;
      layout?: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
      isPublic?: boolean;
    },
  ) {
    return this.prisma.dashboard.create({
      data: {
        tenantId,
        ownerId,
        name: dto.name,
        description: dto.description ?? null,
        layout: (dto.layout ?? []) as never,
        isPublic: dto.isPublic ?? false,
      },
    });
  }

  async update(
    tenantId: string,
    ownerId: string,
    dashboardId: string,
    dto: Partial<{
      name: string;
      description: string | null;
      layout: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
      isPublic: boolean;
    }>,
  ) {
    const existing = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException('Only the dashboard owner may edit it');
    }
    return this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.layout !== undefined ? { layout: dto.layout as never } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      },
    });
  }

  async delete(tenantId: string, ownerId: string, dashboardId: string) {
    const existing = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException('Only the dashboard owner may delete it');
    }
    await this.prisma.dashboard.delete({ where: { id: dashboardId } });
    return { ok: true };
  }

  async list(tenantId: string, userId: string) {
    return this.prisma.dashboard.findMany({
      where: {
        tenantId,
        OR: [{ ownerId: userId }, { isPublic: true }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { components: true } },
      },
    });
  }

  async get(tenantId: string, userId: string, dashboardId: string) {
    const d = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
      include: {
        components: {
          include: { report: { select: { id: true, name: true, format: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!d) throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    if (!d.isPublic && d.ownerId !== userId) {
      throw new ForbiddenException('Dashboard is private');
    }
    return d;
  }

  // ── Components ────────────────────────────────────────────────────────────

  async addComponent(
    tenantId: string,
    ownerId: string,
    dashboardId: string,
    dto: {
      reportId: string;
      visualization?: Visualization;
      title: string;
      options?: Record<string, unknown>;
      position?: { x: number; y: number; w: number; h: number };
    },
  ) {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
    });
    if (!dash) throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    if (dash.ownerId !== ownerId) {
      throw new ForbiddenException('Only the dashboard owner may add components');
    }
    const report = await this.prisma.reportDef.findFirst({
      where: { id: dto.reportId, tenantId },
    });
    if (!report) throw new NotFoundException(`Report ${dto.reportId} not found`);

    return this.prisma.dashboardComponent.create({
      data: {
        tenantId,
        dashboardId,
        reportId: dto.reportId,
        visualization: dto.visualization ?? 'table',
        title: dto.title,
        options: (dto.options ?? {}) as never,
        position: (dto.position ?? {}) as never,
      },
    });
  }

  async removeComponent(
    tenantId: string,
    ownerId: string,
    dashboardId: string,
    componentId: string,
  ) {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
    });
    if (!dash) throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    if (dash.ownerId !== ownerId) {
      throw new ForbiddenException('Only the dashboard owner may remove components');
    }
    await this.prisma.dashboardComponent.deleteMany({
      where: { id: componentId, tenantId, dashboardId },
    });
    return { ok: true };
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  /**
   * Executes every component's underlying report. Failures on a single
   * component are isolated so one broken report doesn't break the whole
   * dashboard render.
   */
  async runDashboard(
    tenantId: string,
    userId: string,
    dashboardId: string,
  ): Promise<{
    dashboardId: string;
    components: Record<string, RunReportResult | { error: string }>;
  }> {
    const d = await this.get(tenantId, userId, dashboardId);
    const result: Record<string, RunReportResult | { error: string }> = {};

    for (const comp of d.components) {
      try {
        result[comp.id] = await this.reports.runReport(tenantId, comp.reportId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `Component ${comp.id} (report=${comp.reportId}) failed: ${msg}`,
        );
        result[comp.id] = { error: msg };
      }
    }

    return { dashboardId: d.id, components: result };
  }
}
