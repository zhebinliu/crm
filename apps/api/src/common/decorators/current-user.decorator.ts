import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../types/request-context';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as RequestUser;
});

export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.user?.tenantId ?? req.tenantId;
});
