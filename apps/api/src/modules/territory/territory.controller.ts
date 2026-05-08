// ─── TerritoryController ─────────────────────────────────────────────────
// Admin-only REST surface for managing territories, members, account
// assignments, and rules. Mounted under /api/admin/territories (the global
// `api` prefix is set in main.ts; the `/admin` segment matches the rest of
// the platform's admin endpoints).

import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { TerritoryService } from './territory.service';
import { AssignmentEngineService } from './assignment-engine.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@UseGuards(PermissionsGuard)
@Controller('admin/territories')
export class TerritoryController {
  constructor(
    private readonly svc: TerritoryService,
    private readonly engine: AssignmentEngineService,
  ) {}

  // ── Territory CRUD ─────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string) {
    return this.svc.listTerritories(tid);
  }

  @Get(':id')
  @RequirePermissions('admin.*')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.getTerritory(tid, id);
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() body: Record<string, unknown>) {
    return this.svc.createTerritory(tid, body as never);
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  update(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateTerritory(tid, id, body as never);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.deleteTerritory(tid, id);
  }

  // ── User assignment ────────────────────────────────────────────────────────

  @Post(':id/users')
  @RequirePermissions('admin.*')
  assignUser(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Body() body: { userId: string; roleInTerritory?: string; isPrimary?: boolean },
  ) {
    return this.svc.assignUser(tid, id, body);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  unassignUser(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.svc.unassignUser(tid, id, userId);
  }

  // ── Manual account assignment ──────────────────────────────────────────────

  @Post(':id/accounts/:accountId')
  @RequirePermissions('admin.*')
  assignAccount(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() body: { isPrimary?: boolean } = {},
  ) {
    return this.svc.assignAccount(tid, accountId, id, {
      source: 'manual',
      isPrimary: body.isPrimary ?? false,
    });
  }

  @Delete(':id/accounts/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  unassignAccount(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ) {
    return this.svc.unassignAccount(tid, accountId, id);
  }

  // ── Assignment rules ───────────────────────────────────────────────────────

  @Get(':id/rules')
  @RequirePermissions('admin.*')
  listRules(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.listRules(tid, id);
  }

  @Post(':id/rules')
  @RequirePermissions('admin.*')
  createRule(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.createRule(tid, id, body as never);
  }

  @Patch(':id/rules/:ruleId')
  @RequirePermissions('admin.*')
  updateRule(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateRule(tid, id, ruleId, body as never);
  }

  @Delete(':id/rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  deleteRule(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.svc.deleteRule(tid, id, ruleId);
  }

  // ── Bulk re-run ────────────────────────────────────────────────────────────

  @Post('run-rules')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin.*')
  runRules(@TenantId() tid: string) {
    return this.engine.runForAllAccounts(tid);
  }
}
