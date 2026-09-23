/** Fetch normalizes both literal and percent-encoded dot segments before sending. */
export function safePath(path: string, segment = false): string {
  if (typeof path !== 'string') throw new TypeError('Path must be a string.');
  if (/(?:^|[/\\])(?:\.|%2e){1,2}(?:[/\\?#]|$)/i.test(path)) {
    throw new TypeError('Dot path segments are not supported.');
  }
  // URL parsers remove controls before resolving paths; matching them is intentional.
  // oxlint-disable-next-line no-control-regex
  if (/[\\?#\x00-\x1f\x7f]/.test(path) || (segment && path.includes('/')))
    throw new TypeError('Unsafe path delimiters; path extensions must return one encoded segment.');
  return path;
}

/** Compare parsed URLs as Fetch will see them, including relative service URLs. */
export function safeUrl(base: string, url: string): string {
  const reference = 'http://openapi.invalid/';
  const source = new URL(base, reference);
  const target = new URL(url, reference);
  if (
    target.origin !== source.origin ||
    !target.pathname.startsWith(`${source.pathname.replace(/\/+$/, '')}/`)
  )
    throw new TypeError('Request URL escapes the service base path.');
  return url;
}
