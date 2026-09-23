function splitUrlSuffix(url: string): { base: string; suffix: string } {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  return { base, suffix: `${query}${hash}` };
}

export function joinUrl(baseUrl: string, path: string): string {
  const { base, suffix } = splitUrlSuffix(baseUrl);
  const normalizedBase = base.replace(/\/+$/, '');
  if (path === '/') return `${normalizedBase}/${suffix}`;
  const normalizedPath = path.replace(/^\//, '');
  if (!normalizedPath) return `${normalizedBase}${suffix}`;
  return `${normalizedBase}/${normalizedPath}${suffix}`;
}

export function appendRawQuery(url: string, raw: string): string {
  if (!raw) return url;
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const target = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator =
    target.endsWith('?') || target.endsWith('&') ? '' : target.includes('?') ? '&' : '?';
  return `${target}${separator}${raw}${hash}`;
}
