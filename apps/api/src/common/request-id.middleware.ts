// ─── RequestIdMiddleware ─────────────────────────────────────────────────
//
// Stamps every inbound request with a stable correlation id:
//   • Honors `X-Request-Id` from inbound (gateway / client) if present
//   • Otherwise generates a nanoid
//   • Echoes `X-Request-Id` on the response so the caller can grep logs
//   • Sets `req.requestId` so downstream handlers / loggers can include it
//   • If OTel is active, copies the id onto the current span as
//     `http.request_id` for cross-system correlation
//
// Wave 18e (observability).

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

/**
 * Augmented Request shape. Consumers can do
 *   `(req as RequestWithId).requestId`
 * to read the id without pulling in any additional types.
 */
export interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound =
      (req.headers['x-request-id'] as string | undefined) ||
      (req.headers['X-Request-Id'] as unknown as string | undefined);
    const requestId = inbound && inbound.trim().length > 0 ? inbound.trim() : nanoid();

    (req as RequestWithId).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Best-effort OTel attribute. We require lazily so this file works
    // even when OTel deps aren't installed (or tracing is off).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const otel = require('@opentelemetry/api');
      const span = otel.trace?.getSpan?.(otel.context?.active?.());
      if (span && typeof span.setAttribute === 'function') {
        span.setAttribute('http.request_id', requestId);
      }
    } catch {
      // OTel optional — silently ignore.
    }

    next();
  }
}
