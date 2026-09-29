import { OpenAPIChainError } from './errors.js';
/** Fetch normalizes both literal and percent-encoded dot segments before sending. */
export function safePath(path: string, segment = false): string {
  if (typeof path !== 'string')
    throw new OpenAPIChainError('UNSAFE_PATH', 'Path must be a string.');
  if (/(?:^|[/\\])(?:\.|%2e){1,2}(?:[/\\?#]|$)/i.test(path)) {
    throw new OpenAPIChainError('UNSAFE_PATH', 'Dot path segments are not supported.');
  }
  // URL parsers remove controls before resolving paths; matching them is intentional.
  // A path value must be one non-empty segment: `/items/{id}` with '' would request
  // `/items/`, which servers commonly route to the collection.
  // oxlint-disable-next-line no-control-regex
  if (/[\\?#\x00-\x1f\x7f]/.test(path) || (segment && !/^[^/]+$/.test(path)))
    throw new OpenAPIChainError('UNSAFE_PATH', 'Unsafe path delimiter or empty path segment.');
  return path;
}

const reference = 'http://openapi.invalid/';
// A client's base URL rarely changes, so remember the last parsed boundary by value.
let lastBase: string | undefined;
let lastBoundary: { origin: string; prefix: string } | undefined;
function baseBoundary(base: string) {
  if (base === lastBase && lastBoundary) return lastBoundary;
  const source = new URL(base, reference);
  const boundary = { origin: source.origin, prefix: `${source.pathname.replace(/\/+$/, '')}/` };
  if (typeof base === 'string') [lastBase, lastBoundary] = [base, boundary];
  return boundary;
}

/** Compare parsed URLs as Fetch will see them, including relative service URLs. */
export function safeUrl(base: string, url: string): string {
  const { origin, prefix } = baseBoundary(base);
  const target = new URL(url, reference);
  if (target.origin !== origin || !target.pathname.startsWith(prefix))
    throw new OpenAPIChainError('UNSAFE_PATH', 'Request URL escapes the service base path.');
  return url;
}
