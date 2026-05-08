import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiKeyService } from '../modules/auth/api-key.service';
import type { RequestUser } from './types/request-context';

/**
 * If the request carries `Authorization: ApiKey twk_xxxxx`, validate it
 * and attach a synthetic RequestUser. The JWT guard short-circuits when
 * `req.user` is already populated, so this transparently slots into the
 * normal auth chain.
 *
 * Bearer-token requests fall through untouched.
 */
@Injectable()
export class ApiKeyAuthMiddleware implements NestMiddleware {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header) return next();
    const [scheme, token] = header.split(' ', 2);
    if (!scheme || scheme.toLowerCase() !== 'apikey' || !token) return next();

    const result = await this.apiKeys.verify(token);
    if (!result) return next(); // let JwtAuthGuard reject with 401

    const synthetic: RequestUser & { isApiKey: true; apiKeyId: string } = {
      id: `apikey:${result.apiKeyId}`,
      apiKeyId: result.apiKeyId,
      tenantId: result.tenantId,
      email: '',
      displayName: `API Key ${result.apiKeyId.slice(0, 8)}`,
      roles: [],
      permissions: result.permissions,
      isApiKey: true,
    };
    req.user = synthetic;
    req.tenantId = result.tenantId;
    next();
  }
}
