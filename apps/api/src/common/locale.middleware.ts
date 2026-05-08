// ─── LocaleMiddleware ────────────────────────────────────────────────────
//
// Resolves the request locale once per inbound request (Wave 19g):
//   1. `?lang=` query parameter (explicit override — wins)
//   2. `Accept-Language` header — first language tag, normalized to BCP-47
//   3. Default `zh-CN` when neither is present
//
// Sets `req.locale` so downstream handlers (and the metadata read flow)
// can honor it without re-parsing headers.
//
// Wiring: register in AppModule.configure() — left as a TODO so this
// commit doesn't touch app.module.ts.

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export interface RequestWithLocale extends Request {
  locale?: string;
}

const DEFAULT_LOCALE = 'zh-CN';

/**
 * Normalizes a raw locale string to BCP-47 (`zh-CN`, `en-US`, ...). Accepts
 * `zh_CN`, `zh-cn`, `zh`, etc. Region (the part after the dash) is upper-
 * cased; primary language is lower-cased.
 */
export function normalizeLocale(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [langRaw, regionRaw] = trimmed.replace('_', '-').split('-');
  if (!langRaw) return null;
  const lang = langRaw.toLowerCase();
  if (!regionRaw) return lang;
  return `${lang}-${regionRaw.toUpperCase()}`;
}

/**
 * Picks the first preferred language out of an Accept-Language header,
 * ignoring weights. Returns null when the header is absent or empty.
 */
export function pickFromAcceptLanguage(header: string | undefined): string | null {
  if (!header) return null;
  // "en-US,en;q=0.9,zh-CN;q=0.8" → "en-US"
  const first = header.split(',')[0]?.split(';')[0];
  return normalizeLocale(first);
}

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const queryLang = (req.query?.['lang'] as string | undefined) ?? undefined;
    const headerVal = (req.headers['accept-language'] as string | undefined) ?? undefined;

    const fromQuery = normalizeLocale(queryLang);
    const fromHeader = pickFromAcceptLanguage(headerVal);

    (req as RequestWithLocale).locale = fromQuery ?? fromHeader ?? DEFAULT_LOCALE;
    next();
  }
}
