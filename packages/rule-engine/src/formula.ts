// ─── Formula expression evaluator ─────────────────────────────────────────
//
// Salesforce-style formula language for FieldDef.type=FORMULA. Supported:
//   • numeric/string/boolean literals: 1.5, "hello", TRUE, FALSE, NULL
//   • field references: amount, account.name (dot path against record)
//   • arithmetic: + - * / %
//   • comparison: = != > >= < <=  (also ==)
//   • logical: AND() OR() NOT()
//   • parentheses: (...)
//   • functions:
//       IF(cond, then, else)
//       CONCAT(a, b, ...)
//       UPPER(s), LOWER(s), LENGTH(s)
//       ROUND(n, decimals?), ABS(n), MIN(...), MAX(...)
//       ISBLANK(v), COALESCE(a, b, ...)
//       TODAY()  → ISO date string
//
// SAFETY: no user-defined functions, no I/O, no globals beyond record.
// Parsing is recursive descent. Cached parsed AST per formula string.
//
//   const compiled = compileFormula('amount * 0.1');
//   const result = compiled({ amount: 1000 });   // → 100

import { resolvePath } from './path';

export type FormulaValue = number | string | boolean | null;

interface Token {
  kind: 'num' | 'str' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'dot' | 'eof';
  value?: string | number;
}

const KEYWORDS = new Map<string, FormulaValue>([
  ['TRUE', true], ['FALSE', false], ['NULL', null],
]);

export class FormulaError extends Error {
  constructor(msg: string, public readonly position?: number) {
    super(`FormulaError: ${msg}${position != null ? ` at pos ${position}` : ''}`);
    this.name = 'FormulaError';
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

const cache = new Map<string, (record: Record<string, unknown>) => FormulaValue>();
const MAX_CACHE = 500;

export function compileFormula(src: string): (record: Record<string, unknown>) => FormulaValue {
  const cached = cache.get(src);
  if (cached) return cached;
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  parser.expect('eof');
  const fn = (record: Record<string, unknown>) => evalNode(ast, record);
  if (cache.size > MAX_CACHE) cache.clear(); // simple eviction
  cache.set(src, fn);
  return fn;
}

export function evaluateFormula(src: string, record: Record<string, unknown>): FormulaValue {
  return compileFormula(src)(record);
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i += 1; continue; }
    if (c === '(') { out.push({ kind: 'lparen' }); i += 1; continue; }
    if (c === ')') { out.push({ kind: 'rparen' }); i += 1; continue; }
    if (c === ',') { out.push({ kind: 'comma' }); i += 1; continue; }
    if (c === '.') { out.push({ kind: 'dot' }); i += 1; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else { s += src[j]; j += 1; }
      }
      if (j >= src.length) throw new FormulaError('unterminated string', i);
      out.push({ kind: 'str', value: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      out.push({ kind: 'num', value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j += 1;
      out.push({ kind: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    // multi-char operators first
    if (src.startsWith('>=', i) || src.startsWith('<=', i) || src.startsWith('!=', i) || src.startsWith('==', i)) {
      out.push({ kind: 'op', value: src.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if ('+-*/%=<>'.includes(c)) {
      out.push({ kind: 'op', value: c });
      i += 1;
      continue;
    }
    throw new FormulaError(`unexpected character "${c}"`, i);
  }
  out.push({ kind: 'eof' });
  return out;
}

// ── AST + parser ──────────────────────────────────────────────────────────

type Node =
  | { type: 'literal'; value: FormulaValue }
  | { type: 'ref'; path: string }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'unary'; op: string; arg: Node }
  | { type: 'call'; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(): Token { return this.tokens[this.pos]!; }
  next(): Token { return this.tokens[this.pos++]!; }
  expect(kind: Token['kind']): Token {
    const t = this.next();
    if (t.kind !== kind) throw new FormulaError(`expected ${kind}, got ${t.kind}`);
    return t;
  }

  // expression : comparison
  parseExpression(): Node { return this.parseComparison(); }

  parseComparison(): Node {
    let left = this.parseAdditive();
    while (this.peek().kind === 'op'
           && ['=', '==', '!=', '<', '<=', '>', '>='].includes(this.peek().value as string)) {
      const op = String(this.next().value);
      const right = this.parseAdditive();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.peek().kind === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = String(this.next().value);
      const right = this.parseMultiplicative();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.peek().kind === 'op' && '*/%'.includes(String(this.peek().value))) {
      const op = String(this.next().value);
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseUnary(): Node {
    if (this.peek().kind === 'op' && (this.peek().value === '-' || this.peek().value === '+')) {
      const op = String(this.next().value);
      return { type: 'unary', op, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Node {
    const t = this.peek();
    if (t.kind === 'num') { this.next(); return { type: 'literal', value: t.value as number }; }
    if (t.kind === 'str') { this.next(); return { type: 'literal', value: t.value as string }; }
    if (t.kind === 'lparen') {
      this.next();
      const e = this.parseExpression();
      this.expect('rparen');
      return e;
    }
    if (t.kind === 'ident') {
      const name = String(this.next().value);
      // Function call?
      if (this.peek().kind === 'lparen') {
        this.next();
        const args: Node[] = [];
        if (this.peek().kind !== 'rparen') {
          args.push(this.parseExpression());
          while (this.peek().kind === 'comma') {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expect('rparen');
        return { type: 'call', name: name.toUpperCase(), args };
      }
      // Keyword (TRUE / FALSE / NULL)?
      if (KEYWORDS.has(name.toUpperCase())) {
        return { type: 'literal', value: KEYWORDS.get(name.toUpperCase())! };
      }
      // Field reference, possibly dotted
      let path = name;
      while (this.peek().kind === 'dot') {
        this.next();
        const seg = this.expect('ident');
        path += `.${seg.value}`;
      }
      return { type: 'ref', path };
    }
    throw new FormulaError(`unexpected token ${t.kind}`);
  }
}

// ── Evaluator ──────────────────────────────────────────────────────────────

function evalNode(node: Node, record: Record<string, unknown>): FormulaValue {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'ref': {
      const v = resolvePath(node.path, { record });
      if (v === undefined || v === null) return null;
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
      // Decimals from Prisma come as strings
      if (typeof v === 'object' && v !== null && 'toString' in v) {
        const s = String(v);
        const n = Number(s);
        return Number.isFinite(n) ? n : s;
      }
      return null;
    }
    case 'unary': {
      const x = evalNode(node.arg, record);
      if (node.op === '-') return -toNum(x);
      return toNum(x);
    }
    case 'binary': {
      const l = evalNode(node.left, record);
      const r = evalNode(node.right, record);
      switch (node.op) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') + String(r ?? '');
          return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': {
          const d = toNum(r);
          if (d === 0) return null;
          return toNum(l) / d;
        }
        case '%': return toNum(l) % toNum(r);
        case '=':
        case '==': return looseEq(l, r);
        case '!=': return !looseEq(l, r);
        case '<':  return toNum(l) <  toNum(r);
        case '<=': return toNum(l) <= toNum(r);
        case '>':  return toNum(l) >  toNum(r);
        case '>=': return toNum(l) >= toNum(r);
        default: throw new FormulaError(`unknown operator ${node.op}`);
      }
    }
    case 'call': return evalCall(node.name, node.args.map((a) => evalNode(a, record)), node.args, record);
  }
}

function evalCall(name: string, args: FormulaValue[], _astArgs: Node[], _record: Record<string, unknown>): FormulaValue {
  switch (name) {
    case 'IF':
      if (args.length !== 3) throw new FormulaError('IF requires (cond, then, else)');
      return truthy(args[0]!) ? args[1]! : args[2]!;
    case 'AND':
      return args.every((a) => truthy(a));
    case 'OR':
      return args.some((a) => truthy(a));
    case 'NOT':
      if (args.length !== 1) throw new FormulaError('NOT requires 1 arg');
      return !truthy(args[0]!);
    case 'CONCAT':
      return args.map((a) => a == null ? '' : String(a)).join('');
    case 'UPPER':
      return args[0] == null ? null : String(args[0]).toUpperCase();
    case 'LOWER':
      return args[0] == null ? null : String(args[0]).toLowerCase();
    case 'LENGTH':
      return args[0] == null ? 0 : String(args[0]).length;
    case 'ROUND': {
      const n = toNum(args[0]!);
      const d = args.length > 1 ? Math.max(0, Math.min(20, toNum(args[1]!))) : 0;
      const p = Math.pow(10, d);
      return Math.round(n * p) / p;
    }
    case 'ABS': return Math.abs(toNum(args[0]!));
    case 'MIN': return Math.min(...args.map(toNum));
    case 'MAX': return Math.max(...args.map(toNum));
    case 'ISBLANK': {
      const v = args[0];
      return v == null || v === '' || (typeof v === 'string' && v.trim() === '');
    }
    case 'COALESCE': {
      for (const a of args) {
        if (a !== null && a !== undefined && a !== '') return a;
      }
      return null;
    }
    case 'TODAY':
      return new Date().toISOString().slice(0, 10);
    default:
      throw new FormulaError(`unknown function ${name}()`);
  }
}

function toNum(v: FormulaValue): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthy(v: FormulaValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0 && v !== 'false' && v !== '0';
  return true;
}

function looseEq(a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === typeof b) return a === b;
  // numeric coercion when one is number
  if (typeof a === 'number' || typeof b === 'number') return toNum(a) === toNum(b);
  return String(a) === String(b);
}
