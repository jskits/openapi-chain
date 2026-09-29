import { withAbsoluteLinks } from '@/lib/llms';
import { docsLlms } from '@/lib/source';
import { appDescription, appName, siteUrl } from '@/lib/shared';

export const revalidate = false;

// https://llmstxt.org: a project title, a one-line summary, then sections of linked pages.
export async function GET() {
  const pages = withAbsoluteLinks(await docsLlms.index())
    .replace(/^# .*\n+/, '')
    .replace(/^- \*\*(.+)\*\*$/gm, '## $1');
  const header = [
    `# ${appName}`,
    '',
    `> ${appDescription}`,
    '',
    `All pages in one file: ${siteUrl}/llms-full.txt. Each page is also available as Markdown at`,
    `${siteUrl}/llms.mdx/docs/<page>/content.md.`,
    '',
    '## Overview',
    '',
  ].join('\n');
  return new Response(`${header}${pages}`);
}
