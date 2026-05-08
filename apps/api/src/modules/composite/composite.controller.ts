// ─── POST /api/composite — Composite API (Wave 18f) ─────────────────────
//
// Salesforce-compatible batch endpoint. Up to 25 sub-requests in one
// round-trip. Supports `@{ref.field}` references between steps and an
// `allOrNone` flag that wraps everything in a Prisma $transaction.
//
// Request shape:
//   {
//     "allOrNone": true,
//     "compositeRequest": [
//       { "method": "POST", "url": "/api/accounts", "referenceId": "newAccount",
//         "body": { "name": "Acme" }},
//       { "method": "POST", "url": "/api/contacts", "referenceId": "newContact",
//         "body": { "lastName": "Doe", "accountId": "@{newAccount.id}" }},
//       { "method": "GET",  "url": "/api/contacts/@{newContact.id}",
//         "referenceId": "verify" }
//     ]
//   }
//
// Response shape (always 200; per-step status in body):
//   { compositeResponse: [
//       { httpStatusCode, body, referenceId },
//       ...
//   ] }
//
// Design choice: instead of simulating an in-process HTTP round-trip via
// Nest's HttpAdapter (which is messy and re-runs all guards/middleware),
// we use a CompositeDispatcher that directly calls the matching service
// method based on a small route registry. See composite.dispatcher.ts.
//
// Limitations:
//   • only LTC routes wired — leads/accounts/contacts/opportunities
//   • no nested @{ref.array[0]} access (dotted paths only)
//   • allOrNone=true relies on Prisma $transaction — long-running steps
//     extend the open transaction; the default 5s timeout applies.

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-context';
import { CompositeDispatcher, type CompositeMethod } from './composite.dispatcher';

const ALLOWED_METHODS: CompositeMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

export class CompositeSubRequestDto {
  @IsString()
  @IsIn(ALLOWED_METHODS)
  method!: CompositeMethod;

  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsString()
  @MaxLength(80)
  referenceId!: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}

export class CompositeBatchDto {
  @IsOptional()
  @IsBoolean()
  allOrNone?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CompositeSubRequestDto)
  compositeRequest!: CompositeSubRequestDto[];
}

interface CompositeStepResponse {
  httpStatusCode: number;
  body: unknown;
  referenceId: string;
}

@UseGuards(PermissionsGuard)
@Controller('composite')
export class CompositeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: CompositeDispatcher,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async run(
    @Body() body: CompositeBatchDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ compositeResponse: CompositeStepResponse[] }> {
    // Validate referenceId uniqueness up front.
    const seen = new Set<string>();
    for (const r of body.compositeRequest) {
      if (seen.has(r.referenceId)) {
        throw new BadRequestException(`Duplicate referenceId "${r.referenceId}"`);
      }
      seen.add(r.referenceId);
    }

    const allOrNone = body.allOrNone === true;
    const refs: Record<string, unknown> = {};
    const responses: CompositeStepResponse[] = [];

    if (allOrNone) {
      // Wrap the whole batch in a Prisma transaction. Throwing rolls back.
      try {
        await this.prisma.$transaction(async () => {
          await this.runSteps(body.compositeRequest, tenantId, user, refs, responses, /* throwOnError */ true);
        });
      } catch (e) {
        // Rollback occurred. Replace any optimistic 2xx responses with
        // a transaction-rolled-back marker so the caller can see which
        // step caused the abort but knows none of them persisted.
        const message = e instanceof Error ? e.message : String(e);
        const failureIdx = responses.findIndex((r) => r.httpStatusCode >= 400);
        const failedRefId = failureIdx >= 0 ? responses[failureIdx]!.referenceId : 'unknown';
        const rolled: CompositeStepResponse[] = body.compositeRequest.map((r, i) => {
          const existing = responses[i];
          if (existing && existing.httpStatusCode >= 400) return existing;
          return {
            httpStatusCode: 400,
            referenceId: r.referenceId,
            body: {
              errorCode: 'PROCESSING_HALTED',
              message: `Transaction rolled back after step "${failedRefId}" failed: ${message}`,
            },
          };
        });
        return { compositeResponse: rolled };
      }
    } else {
      await this.runSteps(body.compositeRequest, tenantId, user, refs, responses, /* throwOnError */ false);
    }

    return { compositeResponse: responses };
  }

  private async runSteps(
    steps: CompositeSubRequestDto[],
    tenantId: string,
    user: RequestUser,
    refs: Record<string, unknown>,
    responses: CompositeStepResponse[],
    throwOnError: boolean,
  ): Promise<void> {
    for (const step of steps) {
      let stepBody: Record<string, unknown> | undefined;
      let stepUrl: string;
      try {
        stepUrl = resolveRefsString(step.url, refs);
        stepBody = step.body ? (resolveRefsDeep(step.body, refs) as Record<string, unknown>) : undefined;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        responses.push({
          httpStatusCode: 400,
          body: { errorCode: 'INVALID_REFERENCE', message: msg },
          referenceId: step.referenceId,
        });
        if (throwOnError) throw e;
        return; // stop early on failure when allOrNone=false too (mirrors SF semantics)
      }

      try {
        const result = await this.dispatcher.dispatch({
          method: step.method,
          url: stepUrl,
          body: stepBody,
          tenantId,
          user,
        });
        const httpStatus =
          step.method === 'POST' ? 201 :
          step.method === 'DELETE' ? 204 :
          200;
        responses.push({
          httpStatusCode: httpStatus,
          body: result ?? null,
          referenceId: step.referenceId,
        });
        refs[step.referenceId] = result ?? null;
      } catch (e) {
        const status = errorToStatus(e);
        const msg = e instanceof Error ? e.message : String(e);
        responses.push({
          httpStatusCode: status,
          body: { errorCode: status === 404 ? 'NOT_FOUND' : 'EXECUTION_ERROR', message: msg },
          referenceId: step.referenceId,
        });
        if (throwOnError) throw e;
        return; // SF semantics: on any failure (allOrNone=false), stop processing
      }
    }
  }
}

// ── Reference resolution: @{refId.path.to.field} ────────────────────────

const REF_RE = /@\{([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)\}/g;

function resolveRefsString(s: string, refs: Record<string, unknown>): string {
  return s.replace(REF_RE, (_match, refId: string, dottedPath: string) => {
    if (!(refId in refs)) {
      throw new Error(`unresolved reference "${refId}"`);
    }
    let cur: unknown = refs[refId];
    if (dottedPath) {
      for (const seg of dottedPath.split('.').filter(Boolean)) {
        if (cur == null || typeof cur !== 'object') {
          throw new Error(`cannot resolve "${refId}${dottedPath}" — non-object encountered`);
        }
        cur = (cur as Record<string, unknown>)[seg];
      }
    }
    if (cur == null) return '';
    if (typeof cur === 'object') return JSON.stringify(cur);
    return String(cur);
  });
}

function resolveRefsDeep(value: unknown, refs: Record<string, unknown>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Optimisation: if the entire string IS a single ref, return the
    // typed value (e.g. a number) instead of stringifying.
    const wholeMatch = value.match(/^@\{([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)\}$/);
    if (wholeMatch) {
      const refId = wholeMatch[1]!;
      const dottedPath = wholeMatch[2]!;
      if (!(refId in refs)) throw new Error(`unresolved reference "${refId}"`);
      let cur: unknown = refs[refId];
      if (dottedPath) {
        for (const seg of dottedPath.split('.').filter(Boolean)) {
          if (cur == null || typeof cur !== 'object') {
            throw new Error(`cannot resolve "${refId}${dottedPath}" — non-object encountered`);
          }
          cur = (cur as Record<string, unknown>)[seg];
        }
      }
      return cur;
    }
    return resolveRefsString(value, refs);
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefsDeep(v, refs));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveRefsDeep(v, refs);
    }
    return out;
  }
  return value;
}

function errorToStatus(e: unknown): number {
  if (e && typeof e === 'object' && 'getStatus' in e && typeof (e as { getStatus: () => number }).getStatus === 'function') {
    return (e as { getStatus: () => number }).getStatus();
  }
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: number }).status === 'number') {
    return (e as { status: number }).status;
  }
  return 500;
}
