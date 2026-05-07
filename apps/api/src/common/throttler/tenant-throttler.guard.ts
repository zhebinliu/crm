// ─── TenantThrottlerGuard ─────────────────────────────────────────────────
//
// Per-tenant rate limiting bucket. Each tenant gets its own counter so a
// noisy tenant cannot exhaust the global limit and starve everyone else,
// while still also keying by source IP inside the tenant so a single
// runaway client cannot DDoS its own tenant.
//
// Tracker shape:
//   tenant:<tenantId>:<ip>     — when JwtAuthGuard has populated req.user
//   ip:<ip>                    — for unauthenticated routes (login, refresh)
//
// `req.user.tenantId` is set by the existing passport JWT strategy. If the
// guard runs before auth (e.g. on a @Public route), we transparently fall
// back to IP-only.

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface MaybeAuthedRequest {
  ip?: string;
  ips?: string[];
  user?: { tenantId?: string; id?: string };
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as MaybeAuthedRequest;
    const ip = resolveIp(r);
    const tenantId = r.user?.tenantId;
    return tenantId ? `tenant:${tenantId}:${ip}` : `ip:${ip}`;
  }
}

function resolveIp(req: MaybeAuthedRequest): string {
  // express's req.ips is populated when `trust proxy` is on; fall back to
  // X-Forwarded-For first hop, then req.ip, then the raw socket address.
  if (req.ips && req.ips.length > 0 && req.ips[0]) return req.ips[0];
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
