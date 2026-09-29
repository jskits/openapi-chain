import { isPlainRecord } from './record.js';

/**
 * Overwrite `target` with each field of `value`. Plain records skip the intermediate Headers
 * object unless a symbol key or case-insensitive duplicate needs its constructor semantics.
 */
export function mergeHeaders(target: Headers, value: HeadersInit): void {
  if (isPlainRecord(value) && !Object.getOwnPropertySymbols(value).length) {
    const fields = Object.entries(value) as [string, string][];
    if (new Set(fields.map(([name]) => name.toLowerCase())).size === fields.length) {
      for (const [name, entry] of fields) target.set(name, entry);
      return;
    }
    value = fields;
  }
  new Headers(value).forEach((entry, name) => target.set(name, entry));
}
