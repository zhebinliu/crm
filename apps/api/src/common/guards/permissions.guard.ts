import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type PermissionCode } from '@tokenwave/shared';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    let req;
    if (ctx.getType<string>() === 'graphql') {
      const { GqlExecutionContext } = require('@nestjs/graphql');
      req = GqlExecutionContext.create(ctx).getContext().req;
    } else {
      req = ctx.switchToHttp().getRequest();
    }

    const user = req.user;
    if (!user) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });

    const granted: string[] = user.permissions ?? [];
    const ok = required.every((code) => hasPermission(granted, code));
    if (!ok) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing permissions: ${required.join(', ')}`,
      });
    }
    return true;
  }
}
