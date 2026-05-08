// ─── POST /api/query — SOQL-style read endpoint (Wave 18f) ──────────────
//
// Request body: { q: string }
// Response   : { done: true, totalSize: number, records: any[] }
//
// Pipeline:
//   1. parseSoql(q)           → ParsedSoql
//   2. compileSoql(parsed)    → { whereClause, select, orderBy, take, skip }
//   3. AND tenant scope onto whereClause
//   4. dispatch to the matching Prisma delegate (lead, account, …)
//   5. pass results through FlsService.filterReadableMany so any field
//      gated by readPermission is stripped silently.
//
// Limitations (stage 1):
//   • no JOINs / subqueries / aggregates
//   • only standard objects (lead, account, contact, opportunity, quote,
//     order, contract, activity, case, campaign)
//   • field whitelist — for v1 we trust the Prisma client to throw on
//     unknown columns; future work will validate against FieldDef.
//   • injection-defence at parse time — see soql.ts rejectInjection().

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  parseSoql,
  compileSoql,
  SOQL_OBJECTS,
  SoqlError,
  type SoqlObjectName,
} from '@tokenwave/rule-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { FlsService } from '../fls/fls.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

export class QueryDto {
  @IsString()
  @MinLength(7)
  @MaxLength(5000)
  q!: string;
}

// Mapping object name → (prisma delegate, read permission, FLS apiName).
type Delegate = { delegate: string; permission: string; flsName: string };
const OBJECT_MAP: Record<SoqlObjectName, Delegate> = {
  lead:        { delegate: 'lead',        permission: 'lead.read',        flsName: 'lead' },
  account:     { delegate: 'account',     permission: 'account.read',     flsName: 'account' },
  contact:     { delegate: 'contact',     permission: 'contact.read',     flsName: 'contact' },
  opportunity: { delegate: 'opportunity', permission: 'opportunity.read', flsName: 'opportunity' },
  quote:       { delegate: 'quote',       permission: 'quote.read',       flsName: 'quote' },
  order:       { delegate: 'order',       permission: 'order.read',       flsName: 'order' },
  contract:    { delegate: 'contract',    permission: 'contract.read',    flsName: 'contract' },
  activity:    { delegate: 'activity',    permission: 'activity.read',    flsName: 'activity' },
  case:        { delegate: 'case',        permission: 'case.read',        flsName: 'case' },
  campaign:    { delegate: 'campaign',    permission: 'campaign.read',    flsName: 'campaign' },
};

@UseGuards(PermissionsGuard)
@Controller('query')
export class QueryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  // No @RequirePermissions at handler level — gating is per-object below
  // because the queried object is only known after parsing the SOQL.
  async run(
    @Body() body: QueryDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ done: true; totalSize: number; records: unknown[] }> {
    let parsed;
    try {
      parsed = parseSoql(body.q);
    } catch (e) {
      if (e instanceof SoqlError) throw new BadRequestException(e.message);
      throw e;
    }
    if (!SOQL_OBJECTS.has(parsed.object)) {
      throw new BadRequestException(`Object "${parsed.object}" is not queryable`);
    }
    const map = OBJECT_MAP[parsed.object];
    // Per-object read check: fall back if user lacks 'query.execute'.
    const grants = user?.permissions ?? [];
    const objWildcard = `${parsed.object}.*`;
    const adminWildcard = 'admin.*';
    if (
      !grants.includes(map.permission) &&
      !grants.includes(objWildcard) &&
      !grants.includes(adminWildcard)
    ) {
      throw new BadRequestException(`Missing permission "${map.permission}"`);
    }

    const compiled = compileSoql(parsed);
    const where = {
      AND: [
        { tenantId, deletedAt: null },
        compiled.whereClause,
      ],
    };

    const delegate = (this.prisma as unknown as Record<string, {
      findMany: (args: unknown) => Promise<unknown[]>;
      count: (args: unknown) => Promise<number>;
    }>)[map.delegate];
    if (!delegate || typeof delegate.findMany !== 'function') {
      throw new BadRequestException(`Object "${parsed.object}" delegate unavailable`);
    }

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: compiled.orderBy.length ? compiled.orderBy : undefined,
      take: compiled.take,
      skip: compiled.skip,
    };
    // Only attach `select` when SELECT specified explicit columns.
    if (Object.keys(compiled.select).length > 0) {
      findArgs['select'] = compiled.select;
    }

    let records: unknown[];
    let totalSize: number;
    try {
      [records, totalSize] = await Promise.all([
        delegate.findMany(findArgs),
        delegate.count({ where }),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Query failed: ${msg}`);
    }

    // Wave 16a — strip FLS-gated fields from each row.
    if (this.fls && Array.isArray(records)) {
      await this.fls.filterReadableMany(
        user,
        map.flsName,
        records as unknown as Record<string, unknown>[],
      );
    }

    return { done: true, totalSize, records };
  }
}
