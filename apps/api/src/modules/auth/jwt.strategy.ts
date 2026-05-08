import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../common/types/request-context';
import { PermissionResolverService } from '../permissions/permission-resolver.service';

export interface JwtPayload {
  sub: string;       // user id
  tid: string;       // tenant id
  email: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly permResolver: PermissionResolverService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true, deletedAt: null },
      include: {
        tenant: true,
        roles: { include: { role: true } },
      },
    });
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User not found' });
    if (!user.tenant.isActive) {
      throw new UnauthorizedException({ code: 'TENANT_INACTIVE', message: 'Tenant is inactive' });
    }

    const roleCodes = user.roles.map((ur) => ur.role.code);
    // Profile + PermSet layer (with soft fallback to legacy Role perms when
    // the user has no Profile assigned yet). Cached for 60s in the resolver.
    const resolved = await this.permResolver.resolveForUser(user.id);

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      roles: roleCodes,
      permissions: resolved.flat,
      managerId: user.managerId,
    };
  }
}
