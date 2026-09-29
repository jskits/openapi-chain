import { siteUrl } from './shared';

/** Site pages use trailing slashes; linking to them directly avoids a redirect per link. */
function pageUrl(path: string): string {
  const hashIndex = path.indexOf('#');
  const pathname = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const slash = pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname) ? '' : '/';
  return `${siteUrl}${pathname}${slash}${hash}`;
}

/**
 * LLM tools read llms.txt and page Markdown without the site's base path, so root-relative site
 * links become absolute URLs. Fenced code is copied unchanged.
 */
export function withAbsoluteLinks(markdown: string): string {
  let fenced = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line
        .replace(/\]\((\/(?!\/)[^)\s]*)\)/g, (_match, path: string) => `](${pageUrl(path)})`)
        .replace(
          /^(\s*\[[^\]]+\]:\s*)(\/(?!\/)\S*)/,
          (_match, head: string, path: string) => `${head}${pageUrl(path)}`,
        );
    })
    .join('\n');
}

export function pageAddress(url: string): string {
  return pageUrl(url);
}
