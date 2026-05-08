import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Machine-to-machine API key service (Wave 18d).
 *
 * Key format:  `twk_<32 hex chars>`  (length 36)
 *  - first 8 chars after `twk_` form the `prefix` (stored plaintext) for
 *    O(1) lookup and human-readable display ("twk_a8c1d2e3 …").
 *  - the full string is bcrypted into `hashedKey`.
 *  - the plaintext is shown to the caller exactly once at issue time.
 */
@Injectable()
export class ApiKeyService {
  private readonly log = new Logger(ApiKeyService.name);
  private static readonly PREFIX_LENGTH = 8;
  private static readonly KEY_PREFIX = 'twk_';
  private static readonly BCRYPT_ROUNDS = 12;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a fresh API key. Returns the plaintext key — caller MUST surface
   * this to the user immediately and never persist it.
   */
  async issue(
    tenantId: string,
    name: string,
    permissions: string[],
    expiresAt: Date | null,
    actorId: string | null,
  ): Promise<{
    id: string;
    key: string;
    prefix: string;
    name: string;
    permissions: string[];
    expiresAt: Date | null;
    createdAt: Date;
  }> {
    // 32 hex chars = 128 bits of entropy after the `twk_` marker.
    const raw = randomBytes(16).toString('hex');
    const fullKey = `${ApiKeyService.KEY_PREFIX}${raw}`;
    const prefix = raw.slice(0, ApiKeyService.PREFIX_LENGTH);
    const hashedKey = await bcrypt.hash(fullKey, ApiKeyService.BCRYPT_ROUNDS);

    const rec = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name,
        prefix,
        hashedKey,
        permissions,
        expiresAt,
        createdById: actorId,
      },
    });

    return {
      id: rec.id,
      key: fullKey,
      prefix: rec.prefix,
      name: rec.name,
      permissions: rec.permissions,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
    };
  }

  /**
   * Validate a raw key. Returns tenant + permission scope if active &
   * unexpired; else null. Updates `lastUsedAt` asynchronously to avoid
   * blocking the request path.
   */
  async verify(
    rawKey: string,
  ): Promise<{ apiKeyId: string; tenantId: string; permissions: string[] } | null> {
    if (!rawKey || !rawKey.startsWith(ApiKeyService.KEY_PREFIX)) return null;
    const body = rawKey.slice(ApiKeyService.KEY_PREFIX.length);
    if (body.length < ApiKeyService.PREFIX_LENGTH) return null;
    const prefix = body.slice(0, ApiKeyService.PREFIX_LENGTH);

    // Lookup by prefix: typically 1-2 candidates per tenant. Cross-tenant
    // collisions are possible (prefix is unique per tenant, not globally),
    // so we may have multiple rows to compare against.
    const candidates = await this.prisma.apiKey.findMany({
      // The verify path doesn't have a tenant context yet — that's the whole
      // point: the API key is the authentication. Skip the tenant guard;
      // bcrypt.compare below is constant-time and bcrypt's own salt rules out
      // cross-tenant collisions on the same prefix.
      where: { prefix, revokedAt: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (candidates.length === 0) return null;

    const now = new Date();
    for (const cand of candidates) {
      if (cand.expiresAt && cand.expiresAt < now) continue;
      // bcrypt.compare is constant-time.
      const ok = await bcrypt.compare(rawKey, cand.hashedKey);
      if (!ok) continue;

      // Fire-and-forget lastUsedAt update — don't block verify.
      this.prisma.apiKey
        .update({ where: { id: cand.id }, data: { lastUsedAt: now } })
        .catch((e) => this.log.warn(`lastUsedAt update failed for ${cand.id}: ${e}`));

      return {
        apiKeyId: cand.id,
        tenantId: cand.tenantId,
        permissions: cand.permissions,
      };
    }
    return null;
  }

  /** Soft-revoke an API key. */
  async revoke(id: string, tenantId: string): Promise<void> {
    const result = await this.prisma.apiKey.updateMany({
      where: { id, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'API key not found' });
    }
  }

  /** List metadata only — never returns hashedKey. */
  async list(tenantId: string) {
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        createdAt: true,
        createdById: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
    return rows;
  }
}
