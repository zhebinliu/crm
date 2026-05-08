// ─── CompositeDispatcher ──────────────────────────────────────────────────
//
// Internal route registry used by the /api/composite endpoint. Rather
// than simulating an HTTP round-trip with adapter.handle(req, res), we
// dispatch each sub-request directly into the corresponding service-layer
// method. Far less code, no IPC, no JSON re-(de)serialisation, no
// duplicate guard execution.
//
// Trade-off: the registry has to be kept in sync with the controllers'
// route shape. For Wave 18f v1 we cover the most common LTC objects:
//
//   POST   /api/leads             → leadService.create
//   GET    /api/leads/:id         → leadService.get
//   PATCH  /api/leads/:id         → leadService.update
//   DELETE /api/leads/:id         → leadService.softDelete
//
//   POST   /api/accounts          → accountService.create
//   GET    /api/accounts/:id      → accountService.get
//   PATCH  /api/accounts/:id      → accountService.update
//   DELETE /api/accounts/:id      → accountService.softDelete
//
//   POST   /api/contacts          → contactService.create
//   GET    /api/contacts/:id      → contactService.get
//   PATCH  /api/contacts/:id      → contactService.update
//   DELETE /api/contacts/:id      → contactService.softDelete
//
//   POST   /api/opportunities     → opportunityService.create
//   GET    /api/opportunities/:id → opportunityService.get
//   PATCH  /api/opportunities/:id → opportunityService.update
//   DELETE /api/opportunities/:id → opportunityService.softDelete
//
// Adding more routes is mechanical: extend SERVICE_KEYS and ROUTES.

import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadService } from '../lead/lead.service';
import { AccountService } from '../account/account.service';
import { ContactService } from '../contact/contact.service';
import { OpportunityService } from '../opportunity/opportunity.service';
import type { RequestUser } from '../../common/types/request-context';

export type CompositeMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface DispatchInput {
  method: CompositeMethod;
  url: string;
  body: Record<string, unknown> | undefined;
  tenantId: string;
  user: RequestUser;
}

interface RouteDef {
  /** matches if `path` parts === pattern parts (param parts start with ':') */
  pattern: string[];
  method: CompositeMethod;
  handler: (
    deps: ServiceMap,
    params: Record<string, string>,
    body: Record<string, unknown> | undefined,
    tenantId: string,
    user: RequestUser,
  ) => Promise<unknown>;
}

interface ServiceMap {
  leads: LeadService;
  accounts: AccountService;
  contacts: ContactService;
  opportunities: OpportunityService;
}

// Each entry resolves URL → method on the matching service.
function buildRoutes(): RouteDef[] {
  const out: RouteDef[] = [];
  const objects: Array<keyof ServiceMap> = ['leads', 'accounts', 'contacts', 'opportunities'];
  for (const obj of objects) {
    out.push({
      pattern: [obj], method: 'POST',
      handler: (deps, _p, body, tid, user) =>
        (deps[obj] as { create: (t: string, b: Record<string, unknown>, u: RequestUser) => Promise<unknown> })
          .create(tid, (body ?? {}) as Record<string, unknown>, user),
    });
    out.push({
      pattern: [obj, ':id'], method: 'GET',
      handler: (deps, p, _b, tid, user) =>
        (deps[obj] as { get: (t: string, id: string, u?: RequestUser) => Promise<unknown> })
          .get(tid, p['id']!, user),
    });
    out.push({
      pattern: [obj, ':id'], method: 'PATCH',
      handler: (deps, p, body, tid, user) =>
        (deps[obj] as { update: (t: string, id: string, b: Record<string, unknown>, u: RequestUser) => Promise<unknown> })
          .update(tid, p['id']!, (body ?? {}) as Record<string, unknown>, user),
    });
    out.push({
      pattern: [obj, ':id'], method: 'PUT',
      handler: (deps, p, body, tid, user) =>
        (deps[obj] as { update: (t: string, id: string, b: Record<string, unknown>, u: RequestUser) => Promise<unknown> })
          .update(tid, p['id']!, (body ?? {}) as Record<string, unknown>, user),
    });
    out.push({
      pattern: [obj, ':id'], method: 'DELETE',
      handler: (deps, p, _b, tid, user) =>
        (deps[obj] as { softDelete: (t: string, id: string, u?: RequestUser) => Promise<unknown> })
          .softDelete(tid, p['id']!, user),
    });
  }
  return out;
}

const ROUTES = buildRoutes();

@Injectable()
export class CompositeDispatcher {
  private readonly services: ServiceMap;

  constructor(
    leads: LeadService,
    accounts: AccountService,
    contacts: ContactService,
    opportunities: OpportunityService,
  ) {
    this.services = { leads, accounts, contacts, opportunities };
  }

  async dispatch(input: DispatchInput): Promise<unknown> {
    const { method, url, body, tenantId, user } = input;
    const path = parseUrl(url);
    if (path.length < 1) throw new NotFoundException(`Composite: invalid URL "${url}"`);
    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (params) {
        return route.handler(this.services, params, body, tenantId, user);
      }
    }
    throw new NotFoundException(`Composite: no route for ${method} ${url}`);
  }
}

/** Strip leading `/api/` and split into segments; empty parts removed. */
function parseUrl(url: string): string[] {
  let p = url.split('?')[0] ?? url;
  if (p.startsWith('/api/')) p = p.slice('/api/'.length);
  else if (p.startsWith('/')) p = p.slice(1);
  return p.split('/').filter(Boolean);
}

function matchPattern(pattern: string[], path: string[]): Record<string, string> | null {
  if (pattern.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const segPattern = pattern[i]!;
    const segActual = path[i]!;
    if (segPattern.startsWith(':')) {
      params[segPattern.slice(1)] = segActual;
    } else if (segPattern !== segActual) {
      return null;
    }
  }
  return params;
}
