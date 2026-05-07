import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context).getContext();
      // HTTP request flow
      if (gqlCtx.req) return gqlCtx.req;
      // WebSocket subscription flow — synthesize a request-like object so
      // passport-jwt's bearer extractor can read the Authorization header.
      const cp = gqlCtx.connectionParams as Record<string, string> | undefined;
      const auth = cp?.Authorization ?? cp?.authorization;
      return {
        headers: auth ? { authorization: auth } : {},
      };
    }
    return context.switchToHttp().getRequest();
  }
}
