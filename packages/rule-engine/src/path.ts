/**
 * Resolve a dot-path against a context, with support for $-prefixed roots.
 *
 *   "name"                 → ctx.record.name
 *   "account.industry"     → ctx.record.account.industry
 *   "$user.id"             → ctx.user.id
 *   "$previous.stage"      → ctx.previous.stage
 *   "$now"                 → new Date()
 *   "$tenant.id"           → ctx.tenant.id
 */
import type { EvalContext } from './types';

const NOW_SENTINELS = new Set(['$now', '$today']);

export function resolvePath(path: string, ctx: EvalContext): unknown {
  if (typeof path !== 'string' || path.length === 0) return undefined;
  if (NOW_SENTINELS.has(path)) return new Date();

  let root: unknown;
  let remainder = path;

  if (path.startsWith('$')) {
    const idx = path.indexOf('.');
    const head = idx === -1 ? path : path.slice(0, idx);
    remainder = idx === -1 ? '' : path.slice(idx + 1);

    switch (head) {
      case '$user':
        root = ctx.user;
        break;
      case '$tenant':
        root = ctx.tenant;
        break;
      case '$previous':
        root = ctx.previous;
        break;
      case '$extra':
        root = ctx.extra;
        break;
      default:
        return undefined;
    }
  } else {
    root = ctx.record;
  }

  if (!remainder) return root;
  return walk(root, remainder);
}

function walk(obj: unknown, dotPath: string): unknown {
  if (obj == null) return undefined;
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Resolve a literal-or-path value. Strings starting with "$" (when isPath is true)
 * are resolved through context; otherwise returned as-is.
 */
export function resolveValue(value: unknown, ctx: EvalContext): unknown {
  if (typeof value === 'string') {
    // 1. Whole path resolution (legacy/SF style)
    if (value.startsWith('$')) {
      return resolvePath(value, ctx);
    }
    // 2. Template interpolation for {{path}} or {{record.path}} or {{$user.id}}
    if (value.includes('{{')) {
      return value.replace(/\{\{(.+?)\}\}/g, (match, path) => {
        const resolved = resolvePath(path.trim(), ctx);
        return resolved != null ? String(resolved) : match;
      });
    }
  }
  return value;
}

/** Set a value at a dot-path, creating intermediate objects as needed. */
export function setPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  const last = parts.pop();
  if (!last) return;
  let cur: Record<string, unknown> = obj;
  for (const part of parts) {
    if (typeof cur[part] !== 'object' || cur[part] === null) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[last] = value;
}
