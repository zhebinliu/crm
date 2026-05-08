import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from './jwt.strategy';
import { MfaService } from './mfa.service';

/**
 * Short-lived "MFA pending" token returned mid-login. Verified by
 * `verifyMfaAndIssueTokens`. Distinct from the access-token payload —
 * has only `sub` + `mfa: true` and a 5-minute TTL.
 */
interface MfaChallengePayload {
  sub: string;
  mfa: true;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
  ) {}

  async login(tenantSlug: string, email: string, password: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid tenant' });
    }

    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email, deletedAt: null },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });

    // If MFA is enabled, gate the login behind a second-factor challenge.
    // Backwards compatible: users without MFA see the original response.
    if (await this.mfa.isEnabled(user.id)) {
      const mfaToken = await this.issueMfaChallengeToken(user.id);
      return { mfaRequired: true as const, mfaToken };
    }

    return this.completeLogin(user.id, tenant.slug);
  }

  /**
   * Step 2 of the two-step login. Validates the short-lived mfaToken,
   * runs the TOTP/backup-code check, and returns the full token bundle.
   */
  async verifyMfaAndIssueTokens(mfaToken: string, code: string) {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(mfaToken);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_MFA_TOKEN', message: 'Invalid or expired MFA token' });
    }
    if (!payload?.sub || payload.mfa !== true) {
      throw new UnauthorizedException({ code: 'INVALID_MFA_TOKEN', message: 'Invalid MFA token' });
    }
    const ok = await this.mfa.verifyForLogin(payload.sub, code);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_MFA_CODE', message: 'Invalid MFA code' });
    }
    const user = await this.prisma.user.findFirst({
      // id is globally unique (cuid); tenant context is recovered via include.
      // skipTenantGuard is safe here because the MFA challenge token already
      // proved possession of an authenticated User.id.
      where: { id: payload.sub },
      include: { tenant: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User disabled' });
    }
    return this.completeLogin(user.id, user.tenant.slug);
  }

  /** Shared finalization for both single-step and post-MFA logins. */
  private async completeLogin(userId: string, tenantSlug: string) {
    const user = await this.prisma.user.findFirst({
      // id is globally unique; tenant context comes via included relations.
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User not found' });

    // Tenant-guard requires tenantId in updates; updateMany lets us add it.
    await this.prisma.user.updateMany({
      where: { id: user.id, tenantId: user.tenantId },
      data: { lastLoginAt: new Date() },
    });

    const roleCodes = user.roles.map((ur) => ur.role.code);
    const perms = Array.from(
      new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    );

    const accessToken = await this.issueAccessToken({
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: roleCodes,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tenantId: user.tenantId,
        tenantSlug,
        roles: roleCodes,
        permissions: perms,
      },
    };
  }

  private async issueMfaChallengeToken(userId: string): Promise<string> {
    const ttl = Number(this.config.get('MFA_CHALLENGE_TTL') ?? 300); // 5 min default
    return this.jwt.signAsync({ sub: userId, mfa: true } satisfies MfaChallengePayload, {
      expiresIn: ttl,
    });
  }

  async refresh(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (!rec || rec.revokedAt || rec.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
    }
    if (!rec.user.isActive || rec.user.deletedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User disabled' });
    }

    const roles = await this.prisma.userRole.findMany({
      where: { userId: rec.userId },
      include: { role: true },
    });

    // Rotate: revoke old, issue new.
    await this.prisma.refreshToken.update({
      where: { id: rec.id },
      data: { revokedAt: new Date() },
    });

    const access = await this.issueAccessToken({
      sub: rec.user.id,
      tid: rec.user.tenantId,
      email: rec.user.email,
      roles: roles.map((r) => r.role.code),
    });
    const next = await this.issueRefreshToken(rec.user.id);
    return { accessToken: access, refreshToken: next };
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async hashPassword(pwd: string): Promise<string> {
    if (!pwd || pwd.length < 8) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Password too short (min 8)' });
    }
    const rounds = Number(this.config.get('PASSWORD_BCRYPT_ROUNDS') ?? 12);
    return bcrypt.hash(pwd, rounds);
  }

  private async issueAccessToken(payload: JwtPayload): Promise<string> {
    const ttl = Number(this.config.get('JWT_ACCESS_TTL') ?? 900);
    return this.jwt.signAsync(payload, { expiresIn: ttl });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const ttl = Number(this.config.get('JWT_REFRESH_TTL') ?? 2592000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return raw;
  }
}
