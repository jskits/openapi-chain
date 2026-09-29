// After `next build`, require absolute links in every LLM-facing file and resolve each site link
// to an exported page. LLM tools do not apply the site's base path to root-relative links.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out/', import.meta.url));
const siteUrl = (process.env.DOCS_SITE_URL ?? 'https://jskits.github.io/openapi-chain').replace(
  /\/$/,
  '',
);
const files = ['llms.txt', 'llms-full.txt'].map((name) => join(out, name));
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
files.push(...walk(join(out, 'llms.mdx')).filter((file) => file.endsWith('.md')));

const problems = [];
let links = 0;
for (const file of files) {
  let fenced = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return;
      const where = `${relative(out, file)}:${index + 1}`;
      for (const [, target] of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        links++;
        if (target.startsWith('/') && !target.startsWith('//'))
          problems.push(`${where}: relative site link ${target}`);
        else if (target.startsWith(`${siteUrl}/`)) {
          const path = decodeURIComponent(target.slice(siteUrl.length).split('#')[0]);
          const exported = path.endsWith('/') ? join(out, path, 'index.html') : join(out, path);
          if (!existsSync(exported)) problems.push(`${where}: no exported page for ${target}`);
        }
      }
    });
}
if (problems.length) {
  console.error(problems.slice(0, 50).join('\n'));
  throw new Error(`${problems.length} LLM link problem(s) in ${files.length} files`);
}
console.log(`[check-llms] ${files.length} files, ${links} links checked`);
