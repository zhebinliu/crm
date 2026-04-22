import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

    await this.prisma.user.update({
      where: { id: user.id },
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
        tenantSlug: tenant.slug,
        roles: roleCodes,
        permissions: perms,
      },
    };
  }

  async refresh(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
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
