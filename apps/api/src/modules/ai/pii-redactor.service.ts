// ─── PiiRedactorService — strip PII before sending text to LLM providers ───
//
// GDPR/PIPL safety net: any text the AI Copilot or RAG embedder ships off to
// OpenAI / Anthropic is first scrubbed of common PII (email, phone, ID
// numbers, bank cards). Each match is replaced with a stable placeholder
// (e.g. `[EMAIL_1]`, `[PHONE_2]`) so LLM responses can be `unredact()`-ed
// back to real values when we want to render them to the end-user.
//
// Idempotent within a single redact() call: the same input text always maps
// to the same placeholder index. Across calls, indices restart at 1 — the
// returned `mappings` is the source of truth.
//
// Patterns covered:
//   • email                      — RFC-ish loose pattern
//   • phone                      — CN +86 mobile, US (+1)-XXX-XXX-XXXX, common
//                                  international forms
//   • CN 18-digit 身份证 (ID)    — checksum-validated (ISO 7064 / GB 11643)
//   • bank-card-like numbers     — 13–19 digit groups passing Luhn
//
// NOT covered (v2 enhancements):
//   • Chinese person names — would need a NER model; pattern-based attempts
//     produce false positives on common product/company nouns.
//   • Addresses, IP addresses, IBANs, passport numbers.
//
// All replacements are performed in priority order (longest/most-specific
// patterns first) to avoid e.g. an ID number being chewed up by the bank-
// card scanner.

import { Injectable, Logger } from '@nestjs/common';

export type PiiKind = 'EMAIL' | 'PHONE' | 'IDCARD' | 'BANKCARD';

export interface RedactionMappings {
  /** placeholder → original value, e.g. { '[EMAIL_1]': 'a@b.com' } */
  [placeholder: string]: string;
}

export interface RedactResult {
  text: string;
  mappings: RedactionMappings;
}

@Injectable()
export class PiiRedactorService {
  private readonly logger = new Logger(PiiRedactorService.name);

  /** Master switch — `AI_REDACT_PII=false` disables redaction (debug only). */
  isEnabled(): boolean {
    const v = process.env.AI_REDACT_PII;
    if (v == null) return true; // default ON
    return !/^(false|0|off|no)$/i.test(v);
  }

  /**
   * Replace PII in `text` with stable placeholders. Returns the redacted
   * text plus a mapping that lets you reverse the process via `unredact()`.
   *
   * Idempotent within one call: the same raw value always gets the same
   * placeholder.
   */
  redact(text: string): RedactResult {
    if (!text) return { text: text ?? '', mappings: {} };
    if (!this.isEnabled()) return { text, mappings: {} };

    const mappings: RedactionMappings = {};
    // Reverse map per-kind so dupes share placeholder indices within this call.
    const reverse: Record<PiiKind, Map<string, string>> = {
      EMAIL: new Map(),
      PHONE: new Map(),
      IDCARD: new Map(),
      BANKCARD: new Map(),
    };
    const counters: Record<PiiKind, number> = { EMAIL: 0, PHONE: 0, IDCARD: 0, BANKCARD: 0 };

    const placeholderFor = (kind: PiiKind, raw: string): string => {
      const existing = reverse[kind].get(raw);
      if (existing) return existing;
      counters[kind] += 1;
      const ph = `[${kind}_${counters[kind]}]`;
      reverse[kind].set(raw, ph);
      mappings[ph] = raw;
      return ph;
    };

    let out = text;

    // 1) Email — done first so an email's local part doesn't trip phone scan.
    out = out.replace(EMAIL_RE, (m) => placeholderFor('EMAIL', m));

    // 2) CN 18-digit ID (with checksum verification — avoids matching random
    //    18-digit strings).
    out = out.replace(CN_ID_RE, (m) => (isValidCnId(m) ? placeholderFor('IDCARD', m) : m));

    // 3) Bank card — 13-19 digits (with optional spaces/dashes), Luhn-checked.
    out = out.replace(BANKCARD_RE, (m) => {
      const digits = m.replace(/[\s-]/g, '');
      if (digits.length < 13 || digits.length > 19) return m;
      if (!luhnValid(digits)) return m;
      return placeholderFor('BANKCARD', m);
    });

    // 4) Phone — last, since previous patterns may have eaten longer matches.
    out = out.replace(PHONE_RE, (m) => {
      const digits = m.replace(/\D/g, '');
      // Sanity: phone should have 7-15 digits (E.164 max is 15)
      if (digits.length < 7 || digits.length > 15) return m;
      return placeholderFor('PHONE', m);
    });

    return { text: out, mappings };
  }

  /**
   * Reverse the placeholders in `text` using the `mappings` from a previous
   * `redact()` call. Only placeholders present in the mapping are restored;
   * unknown placeholders are left as-is.
   */
  unredact(text: string, mappings: RedactionMappings): string {
    if (!text || !mappings) return text ?? '';
    let out = text;
    // Sort keys by length desc so e.g. [EMAIL_10] matches before [EMAIL_1].
    const keys = Object.keys(mappings).sort((a, b) => b.length - a.length);
    for (const ph of keys) {
      // Escape brackets for regex safety.
      const escaped = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'g'), mappings[ph] ?? ph);
    }
    return out;
  }
}

// ── Patterns ──────────────────────────────────────────────────────────────

// Loose RFC 5322-ish; intentionally permissive — false positives are fine here.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

// Phone: covers
//   • CN mobile bare (1[3-9]\d{9})
//   • +86 / 86 prefix + space/hyphen variants
//   • US +1 / 1-XXX-XXX-XXXX / (XXX) XXX-XXXX
//   • Generic +CC (groups of 3-4 digits separated by space/dash, 7-15 digits total)
// We then re-validate digit count in the replace callback.
const PHONE_RE = new RegExp(
  [
    // +86 / 86 with CN mobile
    String.raw`(?:\+?86[\s-]?)?1[3-9]\d{9}`,
    // US-style: +1 NNN-NNN-NNNN or (NNN) NNN-NNNN
    String.raw`\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}`,
    // Generic international: +CC followed by 7-13 digits with separators
    String.raw`\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}`,
  ].join('|'),
  'g',
);

// CN 18-digit 身份证 / Resident ID — 17 digits + check digit (digit or 'X'/'x').
// We add (?<!\d)/(?!\d) word-ish boundaries to avoid matching mid-numeric runs.
const CN_ID_RE = /(?<!\d)\d{17}[\dXx](?!\d)/g;

// Bank-card-shaped: 13-19 digits possibly grouped by spaces or dashes.
const BANKCARD_RE = /(?<!\d)(?:\d{4}[\s-]?){2,4}\d{1,4}(?!\d)/g;

// ── Validators ────────────────────────────────────────────────────────────

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECKS = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

/** ISO-7064 / GB 11643 checksum for CN 18-digit Resident ID. */
function isValidCnId(id: string): boolean {
  if (id.length !== 18) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const d = id.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    sum += d * (ID_WEIGHTS[i] ?? 0);
  }
  const expected = ID_CHECKS[sum % 11];
  const actual = id[17]?.toUpperCase();
  return expected === actual;
}

/** Standard Luhn algorithm for bank card numbers. */
function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
