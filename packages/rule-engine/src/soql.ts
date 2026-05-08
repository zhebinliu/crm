// ─── SOQL-style query parser & compiler ──────────────────────────────────
//
// Minimal Salesforce-Object-Query-Language subset for the Headless API.
// Translates a query string into a Prisma `where` + `select` + orderBy/take/skip.
//
// Example:
//   SELECT id, name, amount FROM opportunity
//     WHERE amount > 100000 AND stage = 'closed_won' AND closeDate >= '2026-01-01'
//     ORDER BY amount DESC
//     LIMIT 50
//
// Supported tokens:
//   SELECT, FROM, WHERE, AND/OR, =, !=, >, >=, <, <=, IN (...), LIKE,
//   IS NULL, IS NOT NULL, ORDER BY, ASC/DESC, LIMIT, OFFSET,
//   dotted field paths (account.name), parenthesised groups.
//
// Out of scope (stage 1):
//   • JOINs / subqueries
//   • aggregate functions (COUNT/SUM/AVG/...)
//   • custom (CustomRecord) objects — only standard delegates
//   • DML (INSERT/UPDATE/DELETE) — strictly read-only
//   • bind variables — literals only
//
// SAFETY: hard-rejects anything that smells like SQL injection. No
//   semicolons, no UNION, no DDL/DML keywords, no comments. Tokenizer
//   refuses unknown characters.
//
// Field names are passed through to Prisma verbatim — the Query controller
// is expected to validate them against a FieldDef whitelist when the
// schema is custom; for v1 we trust the Prisma client to throw on unknown
// columns and surface that as a 400.
//
// Pattern: recursive-descent parser, mirroring `formula.ts`.

// ── Public types ──────────────────────────────────────────────────────────

export type SoqlValue = string | number | boolean | null;

export type SoqlObjectName =
  | 'lead'
  | 'account'
  | 'contact'
  | 'opportunity'
  | 'quote'
  | 'order'
  | 'contract'
  | 'activity'
  | 'case'
  | 'campaign';

export const SOQL_OBJECTS: ReadonlySet<SoqlObjectName> = new Set([
  'lead',
  'account',
  'contact',
  'opportunity',
  'quote',
  'order',
  'contract',
  'activity',
  'case',
  'campaign',
]);

export type SoqlOp =
  | '=' | '!=' | '<' | '<=' | '>' | '>='
  | 'IN' | 'NOT_IN'
  | 'LIKE'
  | 'IS_NULL' | 'IS_NOT_NULL';

export interface SoqlComparison {
  type: 'cmp';
  field: string; // dotted path
  op: SoqlOp;
  value?: SoqlValue | SoqlValue[];
}

export interface SoqlLogical {
  type: 'and' | 'or';
  children: SoqlWhere[];
}

export type SoqlWhere = SoqlComparison | SoqlLogical;

export interface SoqlOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ParsedSoql {
  object: SoqlObjectName;
  fields: string[];          // ['*'] means SELECT * style not supported but '*' literal allowed
  where: SoqlWhere | null;
  orderBy: SoqlOrderBy[];
  limit: number | null;
  offset: number | null;
}

export interface PrismaWhere {
  [k: string]: unknown;
}

export interface PrismaSelect {
  [k: string]: true | PrismaSelect;
}

export interface CompiledSoql {
  whereClause: PrismaWhere;
  select: PrismaSelect;
  orderBy: Array<Record<string, 'asc' | 'desc' | Record<string, 'asc' | 'desc'>>>;
  take: number | undefined;
  skip: number | undefined;
}

export class SoqlError extends Error {
  constructor(msg: string, public readonly position?: number) {
    super(`SoqlError: ${msg}${position != null ? ` at pos ${position}` : ''}`);
    this.name = 'SoqlError';
  }
}

// ── Injection-defence: forbidden tokens / patterns ────────────────────────

const FORBIDDEN_KEYWORDS = new Set([
  'UNION', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE',
  'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'MERGE',
  'COPY', 'SAVEPOINT', 'COMMIT', 'ROLLBACK', 'SHUTDOWN',
]);

function rejectInjection(src: string): void {
  if (src.includes(';')) throw new SoqlError('semicolons are not allowed');
  if (src.includes('--')) throw new SoqlError('SQL comments are not allowed');
  if (src.includes('/*') || src.includes('*/')) throw new SoqlError('block comments are not allowed');
  // crude word-boundary scan for blocked verbs
  const upper = src.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) throw new SoqlError(`forbidden keyword: ${kw}`);
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────

interface Token {
  kind: 'kw' | 'ident' | 'num' | 'str' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';
  value?: string | number;
  pos: number;
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE',
  'IS', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
  'TRUE', 'FALSE',
]);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i += 1; continue; }
    if (c === '(') { out.push({ kind: 'lparen', pos: i }); i += 1; continue; }
    if (c === ')') { out.push({ kind: 'rparen', pos: i }); i += 1; continue; }
    if (c === ',') { out.push({ kind: 'comma', pos: i }); i += 1; continue; }
    if (c === '*' && (out[out.length - 1]?.kind === 'kw' && out[out.length - 1]?.value === 'SELECT')) {
      out.push({ kind: 'ident', value: '*', pos: i });
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else { s += src[j]; j += 1; }
      }
      if (j >= src.length) throw new SoqlError('unterminated string', start);
      out.push({ kind: 'str', value: s, pos: start });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const start = i;
      let j = i;
      if (c === '-') j += 1;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      const n = Number(src.slice(start, j));
      if (!Number.isFinite(n)) throw new SoqlError('invalid number', start);
      out.push({ kind: 'num', value: n, pos: start });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j]!)) j += 1;
      const word = src.slice(start, j);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        out.push({ kind: 'kw', value: upper, pos: start });
      } else {
        out.push({ kind: 'ident', value: word, pos: start });
      }
      i = j;
      continue;
    }
    // multi-char operators first
    if (src.startsWith('!=', i) || src.startsWith('<=', i) || src.startsWith('>=', i)) {
      out.push({ kind: 'op', value: src.slice(i, i + 2), pos: i });
      i += 2;
      continue;
    }
    if (c === '=' || c === '<' || c === '>') {
      out.push({ kind: 'op', value: c, pos: i });
      i += 1;
      continue;
    }
    throw new SoqlError(`unexpected character "${c}"`, i);
  }
  out.push({ kind: 'eof', pos: src.length });
  return out;
}

// ── Parser ────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(off = 0): Token { return this.tokens[this.pos + off]!; }
  next(): Token { return this.tokens[this.pos++]!; }

  expectKw(word: string): Token {
    const t = this.next();
    if (t.kind !== 'kw' || t.value !== word) {
      throw new SoqlError(`expected ${word}, got ${describeToken(t)}`, t.pos);
    }
    return t;
  }

  matchKw(word: string): boolean {
    const t = this.peek();
    if (t.kind === 'kw' && t.value === word) { this.next(); return true; }
    return false;
  }

  parseQuery(): ParsedSoql {
    this.expectKw('SELECT');
    const fields = this.parseFieldList();
    this.expectKw('FROM');
    const objToken = this.next();
    if (objToken.kind !== 'ident') {
      throw new SoqlError(`expected object name, got ${describeToken(objToken)}`, objToken.pos);
    }
    const objName = String(objToken.value).toLowerCase();
    if (!SOQL_OBJECTS.has(objName as SoqlObjectName)) {
      throw new SoqlError(`unknown object "${objName}" (only standard objects supported)`, objToken.pos);
    }

    let where: SoqlWhere | null = null;
    if (this.matchKw('WHERE')) {
      where = this.parseOr();
    }

    const orderBy: SoqlOrderBy[] = [];
    if (this.matchKw('ORDER')) {
      this.expectKw('BY');
      orderBy.push(this.parseOrderItem());
      while (this.peek().kind === 'comma') {
        this.next();
        orderBy.push(this.parseOrderItem());
      }
    }

    let limit: number | null = null;
    if (this.matchKw('LIMIT')) {
      const n = this.next();
      if (n.kind !== 'num') throw new SoqlError('LIMIT expects a number', n.pos);
      limit = Number(n.value);
      if (!Number.isInteger(limit) || limit < 0 || limit > 2000) {
        throw new SoqlError('LIMIT must be integer in [0, 2000]', n.pos);
      }
    }

    let offset: number | null = null;
    if (this.matchKw('OFFSET')) {
      const n = this.next();
      if (n.kind !== 'num') throw new SoqlError('OFFSET expects a number', n.pos);
      offset = Number(n.value);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new SoqlError('OFFSET must be a non-negative integer', n.pos);
      }
    }

    if (this.peek().kind !== 'eof') {
      throw new SoqlError(`unexpected token ${describeToken(this.peek())}`, this.peek().pos);
    }
    return { object: objName as SoqlObjectName, fields, where, orderBy, limit, offset };
  }

  parseFieldList(): string[] {
    const out: string[] = [];
    out.push(this.parseFieldRef());
    while (this.peek().kind === 'comma') {
      this.next();
      out.push(this.parseFieldRef());
    }
    return out;
  }

  parseFieldRef(): string {
    const t = this.next();
    if (t.kind !== 'ident') throw new SoqlError(`expected field, got ${describeToken(t)}`, t.pos);
    return String(t.value);
  }

  parseOrderItem(): SoqlOrderBy {
    const f = this.parseFieldRef();
    let dir: 'asc' | 'desc' = 'asc';
    if (this.matchKw('ASC')) dir = 'asc';
    else if (this.matchKw('DESC')) dir = 'desc';
    return { field: f, direction: dir };
  }

  // OR has lower precedence than AND
  parseOr(): SoqlWhere {
    const left = this.parseAnd();
    if (!this.matchKw('OR')) return left;
    const children: SoqlWhere[] = [left];
    children.push(this.parseAnd());
    while (this.matchKw('OR')) children.push(this.parseAnd());
    return { type: 'or', children };
  }

  parseAnd(): SoqlWhere {
    const left = this.parseNot();
    if (!this.matchKw('AND')) return left;
    const children: SoqlWhere[] = [left];
    children.push(this.parseNot());
    while (this.matchKw('AND')) children.push(this.parseNot());
    return { type: 'and', children };
  }

  parseNot(): SoqlWhere {
    // NOT is not currently supported as a unary; reserved for the future.
    if (this.peek().kind === 'kw' && this.peek().value === 'NOT') {
      throw new SoqlError('NOT is not supported in stage 1', this.peek().pos);
    }
    return this.parsePredicate();
  }

  parsePredicate(): SoqlWhere {
    if (this.peek().kind === 'lparen') {
      this.next();
      const inner = this.parseOr();
      const close = this.next();
      if (close.kind !== 'rparen') {
        throw new SoqlError('expected ")"', close.pos);
      }
      return inner;
    }
    return this.parseComparison();
  }

  parseComparison(): SoqlComparison {
    const fieldTok = this.next();
    if (fieldTok.kind !== 'ident') {
      throw new SoqlError(`expected field, got ${describeToken(fieldTok)}`, fieldTok.pos);
    }
    const field = String(fieldTok.value);

    // IS NULL / IS NOT NULL
    if (this.peek().kind === 'kw' && this.peek().value === 'IS') {
      this.next();
      let op: SoqlOp = 'IS_NULL';
      if (this.peek().kind === 'kw' && this.peek().value === 'NOT') {
        this.next();
        op = 'IS_NOT_NULL';
      }
      const nullTok = this.next();
      if (nullTok.kind !== 'kw' || nullTok.value !== 'NULL') {
        throw new SoqlError('expected NULL after IS', nullTok.pos);
      }
      return { type: 'cmp', field, op };
    }

    // IN ( ... ) or NOT IN ( ... )
    if (this.peek().kind === 'kw' && this.peek().value === 'IN') {
      this.next();
      const list = this.parseValueList();
      return { type: 'cmp', field, op: 'IN', value: list };
    }

    // LIKE 'pattern'
    if (this.peek().kind === 'kw' && this.peek().value === 'LIKE') {
      this.next();
      const v = this.parseLiteral();
      if (typeof v !== 'string') throw new SoqlError('LIKE requires a string pattern');
      return { type: 'cmp', field, op: 'LIKE', value: v };
    }

    // = != < <= > >=
    const opTok = this.next();
    if (opTok.kind !== 'op') {
      throw new SoqlError(`expected comparison operator, got ${describeToken(opTok)}`, opTok.pos);
    }
    const op = opTok.value as SoqlOp;
    if (!['=', '!=', '<', '<=', '>', '>='].includes(op)) {
      throw new SoqlError(`unknown operator "${op}"`, opTok.pos);
    }
    const v = this.parseLiteral();
    return { type: 'cmp', field, op, value: v };
  }

  parseValueList(): SoqlValue[] {
    const open = this.next();
    if (open.kind !== 'lparen') throw new SoqlError('expected "(" after IN', open.pos);
    const out: SoqlValue[] = [];
    if (this.peek().kind !== 'rparen') {
      out.push(this.parseLiteral());
      while (this.peek().kind === 'comma') {
        this.next();
        out.push(this.parseLiteral());
      }
    }
    const close = this.next();
    if (close.kind !== 'rparen') throw new SoqlError('expected ")"', close.pos);
    return out;
  }

  parseLiteral(): SoqlValue {
    const t = this.next();
    if (t.kind === 'num') return Number(t.value);
    if (t.kind === 'str') return String(t.value);
    if (t.kind === 'kw' && t.value === 'TRUE') return true;
    if (t.kind === 'kw' && t.value === 'FALSE') return false;
    if (t.kind === 'kw' && t.value === 'NULL') return null;
    throw new SoqlError(`expected literal, got ${describeToken(t)}`, t.pos);
  }
}

function describeToken(t: Token): string {
  if (t.kind === 'eof') return 'end-of-input';
  return `${t.kind}${t.value !== undefined ? `("${t.value}")` : ''}`;
}

// ── Public API: parse + compile ───────────────────────────────────────────

export function parseSoql(src: string): ParsedSoql {
  if (typeof src !== 'string') throw new SoqlError('query must be a string');
  if (src.length > 5000) throw new SoqlError('query too long (max 5000 chars)');
  rejectInjection(src);
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  return parser.parseQuery();
}

/**
 * Compile a parsed SOQL tree into Prisma findMany arguments.
 * Caller is responsible for AND-ing the tenant scope onto `whereClause`.
 */
export function compileSoql(parsed: ParsedSoql): CompiledSoql {
  const select = compileSelect(parsed.fields);
  const whereClause = parsed.where ? compileWhere(parsed.where) : {};
  const orderBy = parsed.orderBy.map(compileOrder);
  return {
    whereClause,
    select,
    orderBy,
    take: parsed.limit ?? undefined,
    skip: parsed.offset ?? undefined,
  };
}

function compileSelect(fields: string[]): PrismaSelect {
  const out: PrismaSelect = {};
  for (const f of fields) {
    if (f === '*') {
      // SELECT * — Prisma has no native equivalent; caller should treat
      // empty select as "everything". We return {} and the controller
      // omits `select` from the query entirely.
      return {};
    }
    setPath(out, f.split('.'));
  }
  // Always include id so totalSize / pagination keys are coherent.
  if (!('id' in out)) out['id'] = true;
  return out;
}

function setPath(target: PrismaSelect, parts: string[]): void {
  if (parts.length === 1) {
    target[parts[0]!] = true;
    return;
  }
  const head = parts[0]!;
  const existing = target[head];
  if (existing === true || existing === undefined) {
    const next: PrismaSelect = {};
    target[head] = { select: next } as unknown as PrismaSelect;
    setPath(next, parts.slice(1));
  } else {
    const inner = (existing as { select: PrismaSelect }).select;
    setPath(inner, parts.slice(1));
  }
}

function compileWhere(node: SoqlWhere): PrismaWhere {
  if (node.type === 'and') {
    return { AND: node.children.map(compileWhere) };
  }
  if (node.type === 'or') {
    return { OR: node.children.map(compileWhere) };
  }
  // node.type === 'cmp'
  return compileCmp(node as SoqlComparison);
}

function compileCmp(c: SoqlComparison): PrismaWhere {
  const path = c.field.split('.');
  let predicate: unknown;
  switch (c.op) {
    case '=':  predicate = { equals: c.value as SoqlValue }; break;
    case '!=': predicate = { not: { equals: c.value as SoqlValue } }; break;
    case '<':  predicate = { lt: c.value as SoqlValue }; break;
    case '<=': predicate = { lte: c.value as SoqlValue }; break;
    case '>':  predicate = { gt: c.value as SoqlValue }; break;
    case '>=': predicate = { gte: c.value as SoqlValue }; break;
    case 'IN': predicate = { in: c.value as SoqlValue[] }; break;
    case 'NOT_IN': predicate = { notIn: c.value as SoqlValue[] }; break;
    case 'LIKE': {
      // Translate SQL LIKE patterns to Prisma `contains`/`startsWith`/`endsWith`.
      const s = String(c.value);
      const startsWith = s.endsWith('%') && !s.startsWith('%');
      const endsWith = s.startsWith('%') && !s.endsWith('%');
      const both = s.startsWith('%') && s.endsWith('%');
      const stripped = s.replace(/^%|%$/g, '');
      if (both) predicate = { contains: stripped, mode: 'insensitive' };
      else if (startsWith) predicate = { startsWith: stripped, mode: 'insensitive' };
      else if (endsWith) predicate = { endsWith: stripped, mode: 'insensitive' };
      else predicate = { equals: stripped };
      break;
    }
    case 'IS_NULL': predicate = null; break;
    case 'IS_NOT_NULL': predicate = { not: null }; break;
  }
  // wrap predicate at the end of the dotted path
  return wrapPath(path, predicate);
}

function wrapPath(parts: string[], leaf: unknown): PrismaWhere {
  if (parts.length === 1) return { [parts[0]!]: leaf } as PrismaWhere;
  return { [parts[0]!]: wrapPath(parts.slice(1), leaf) as unknown };
}

function compileOrder(o: SoqlOrderBy): Record<string, 'asc' | 'desc' | Record<string, 'asc' | 'desc'>> {
  const parts = o.field.split('.');
  if (parts.length === 1) return { [parts[0]!]: o.direction };
  // dotted: build nested { account: { name: 'asc' } }
  let inner: unknown = o.direction;
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    inner = { [parts[i]!]: inner };
  }
  return { [parts[0]!]: inner } as Record<string, 'asc' | 'desc' | Record<string, 'asc' | 'desc'>>;
}
