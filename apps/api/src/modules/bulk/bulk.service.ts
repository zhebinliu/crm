// ─── BulkService ─────────────────────────────────────────────────────────
// Salesforce-style Bulk API: a single HTTP call accepting an array of
// records, dispatched per-record through the standard service.create()/
// .update()/.delete() so workflow rules, validation rules, audit log,
// and outbox events all fire identically to single-record calls.
//
// Closes audit P1e. Up to MAX_BULK_RECORDS rows per request. Per-record
// success/error returned so callers can retry only the failed rows.

import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadService } from '../lead/lead.service';
import { AccountService } from '../account/account.service';
import { ContactService } from '../contact/contact.service';
import { OpportunityService } from '../opportunity/opportunity.service';
import { CaseService } from '../case/case.service';
import { CampaignService } from '../campaign/campaign.service';
import type { RequestUser } from '../../common/types/request-context';

export type BulkOp = 'insert' | 'update' | 'upsert' | 'delete';

export interface BulkRequest {
  op: BulkOp;
  records: Array<Record<string, unknown> & { id?: string }>;
  /** When op=upsert, which field to match on. Defaults to "id". */
  externalIdField?: string;
}

export interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    index: number;
    success: boolean;
    id?: string;
    op: BulkOp;
    error?: string;
  }>;
}

const MAX_BULK_RECORDS = 1000;

interface ObjectAdapter {
  create: (tenantId: string, data: Record<string, unknown>, user: RequestUser) => Promise<{ id: string }>;
  update: (tenantId: string, id: string, data: Record<string, unknown>, user: RequestUser) => Promise<{ id: string }>;
  delete: (tenantId: string, id: string) => Promise<unknown>;
}

@Injectable()
export class BulkService {
  private readonly adapters: Record<string, ObjectAdapter>;

  constructor(
    leads: LeadService,
    accounts: AccountService,
    contacts: ContactService,
    opps: OpportunityService,
    cases: CaseService,
    campaigns: CampaignService,
  ) {
    // Wrap each service to a uniform adapter shape. All services already
    // return objects with { id }; the assertion is safe.
    const wrap = (svc: {
      create: (t: string, d: Record<string, unknown>, u: RequestUser) => Promise<{ id: string }>;
      update: (t: string, id: string, d: Record<string, unknown>, u: RequestUser) => Promise<{ id: string }>;
      softDelete: (t: string, id: string) => Promise<unknown>;
    }): ObjectAdapter => ({
      create: (t, d, u) => svc.create(t, d, u),
      update: (t, id, d, u) => svc.update(t, id, d, u),
      delete: (t, id) => svc.softDelete(t, id),
    });

    this.adapters = {
      lead:        wrap(leads as never),
      account:     wrap(accounts as never),
      contact:     wrap(contacts as never),
      opportunity: wrap(opps as never),
      case:        wrap(cases as never),
      campaign:    wrap(campaigns as never),
    };
  }

  async runBulk(
    tenantId: string,
    objectApiName: string,
    body: BulkRequest,
    user: RequestUser,
  ): Promise<BulkResult> {
    const key = objectApiName.toLowerCase();
    const adapter = this.adapters[key];
    if (!adapter) {
      throw new NotFoundException(`Bulk ops not supported for object "${objectApiName}". Supported: ${Object.keys(this.adapters).join(', ')}`);
    }
    if (!Array.isArray(body.records) || body.records.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, results: [] };
    }
    if (body.records.length > MAX_BULK_RECORDS) {
      throw new NotFoundException(`Bulk request exceeds limit of ${MAX_BULK_RECORDS} records (got ${body.records.length})`);
    }

    const result: BulkResult = { total: body.records.length, succeeded: 0, failed: 0, results: [] };

    for (let i = 0; i < body.records.length; i += 1) {
      const r = body.records[i] ?? {};
      try {
        let id: string | undefined;
        switch (body.op) {
          case 'insert': {
            const created = await adapter.create(tenantId, r, user);
            id = created.id;
            break;
          }
          case 'update': {
            if (!r.id || typeof r.id !== 'string') {
              throw new Error('update record requires `id` field');
            }
            const { id: rid, ...patch } = r;
            const updated = await adapter.update(tenantId, rid, patch, user);
            id = updated.id;
            break;
          }
          case 'upsert': {
            // For now upsert by id only; external-id matching is a follow-up.
            if (r.id && typeof r.id === 'string') {
              const { id: rid, ...patch } = r;
              try {
                const updated = await adapter.update(tenantId, rid, patch, user);
                id = updated.id;
              } catch (e) {
                if ((e as { status?: number }).status === 404 || (e as Error).message?.includes('not found')) {
                  const created = await adapter.create(tenantId, r, user);
                  id = created.id;
                } else throw e;
              }
            } else {
              const created = await adapter.create(tenantId, r, user);
              id = created.id;
            }
            break;
          }
          case 'delete': {
            if (!r.id || typeof r.id !== 'string') {
              throw new Error('delete record requires `id` field');
            }
            await adapter.delete(tenantId, r.id);
            id = r.id;
            break;
          }
          default:
            throw new Error(`Unknown op: ${body.op}`);
        }
        result.succeeded += 1;
        result.results.push({ index: i, success: true, id, op: body.op });
      } catch (e) {
        result.failed += 1;
        result.results.push({
          index: i, success: false, op: body.op,
          error: (e as Error).message ?? String(e),
        });
      }
    }
    return result;
  }
}
