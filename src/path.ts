/** Fetch normalizes both literal and percent-encoded dot segments before sending. */
export function safePath(path: string): string {
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path)) {
    throw new TypeError('Dot path segments are not supported.');
  }
  return path;
}
