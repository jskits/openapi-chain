// Generate website pages from the repository's Markdown, so GitHub and the site share one source.
//   node scripts/sync-docs.mjs           write website/content/docs/**/*.md once
//   node scripts/sync-docs.mjs --watch   rewrite whenever a source document changes
// Generated pages are `.md` files and are not committed; authored site pages use `.mdx`.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';
import { visit } from 'unist-util-visit';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const contentDir = fileURLToPath(new URL('../content/docs/', import.meta.url));
export const repositoryUrl = 'https://github.com/jskits/openapi-chain';
const branch = 'main';

/** Repository documents published on the site, keyed by repository path. */
export function collectPages() {
  const pages = new Map();
  const add = (source, target, title, description) =>
    pages.set(source, { source, target, title, description });
  for (const file of readdirSync(join(root, 'docs')).sort()) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const name = file.slice(0, -3);
    if (name === 'legacy-changelog') add(`docs/${file}`, 'changelog/legacy');
    else if (name === 'qualification-runtime-hardening')
      add(`docs/${file}`, 'archive/runtime-hardening');
    else add(`docs/${file}`, name);
  }
  for (const file of readdirSync(join(root, 'docs/archive/qualification')).sort()) {
    if (!file.endsWith('.md')) continue;
    const target = file === 'README.md' ? 'archive/index' : `archive/${file.slice(0, -3)}`;
    add(`docs/archive/qualification/${file}`, target);
  }
  add('CONTRIBUTING.md', 'contributing');
  add('SECURITY.md', 'security');
  add(
    'packages/core/CHANGELOG.md',
    'changelog/core',
    'openapi-chain',
    'Release notes for openapi-chain.',
  );
  add(
    'packages/cli/CHANGELOG.md',
    'changelog/cli',
    '@openapi-chain/cli',
    'Release notes for @openapi-chain/cli.',
  );
  add(
    'packages/query/CHANGELOG.md',
    'changelog/query',
    '@openapi-chain/query',
    'Release notes for @openapi-chain/query.',
  );
  return pages;
}

/** Documents with a site page that is not generated from them. */
const aliases = new Map([['docs/README.md', '/docs']]);

const parse = (markdown) =>
  fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

/** Heading anchors as GitHub and Fumadocs generate them. */
function anchors(tree) {
  const slugger = new GithubSlugger();
  const found = new Set();
  visit(tree, 'heading', (node) => found.add(slugger.slug(toString(node))));
  return found;
}

const isSeparator = (node) => node.type === 'text' && /^[\s·|]*$/.test(node.value);
const isNavigation = (node) =>
  node?.type === 'paragraph' &&
  node.children.some((child) => child.type === 'link') &&
  node.children.every((child) => child.type === 'link' || isSeparator(child));

function firstSentence(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const match = /^(.+?[.!?])(?:\s|$)/.exec(flat);
  return match ? match[1] : flat;
}

function siteUrl(target) {
  return target === 'index' ? '/docs' : `/docs/${target.replace(/\/index$/, '')}`;
}

/** Whether a repository path is a file, a directory or missing. */
function repositoryKind(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return undefined;
  return statSync(absolute).isDirectory() ? 'directory' : 'file';
}

/**
 * Transform one repository document into a site page. `markdown` and `kindOf` default to the
 * repository contents; tests pass fixtures instead.
 */
export function transformPage(
  page,
  pages,
  headingsOf,
  { markdown = readFileSync(join(root, page.source), 'utf8'), kindOf = repositoryKind } = {},
) {
  const tree = parse(markdown);
  const [heading, ...rest] = tree.children;
  if (heading?.type !== 'heading' || heading.depth !== 1)
    throw new Error(`${page.source}: the first block must be a level-1 heading`);
  const edits = [
    {
      start: heading.position.start.offset,
      end: rest[0]?.position.start.offset ?? markdown.length,
      text: '',
    },
  ];
  let body = rest;
  if (isNavigation(body[0])) {
    edits.push({
      start: body[0].position.start.offset,
      end: body[1]?.position.start.offset ?? markdown.length,
      text: '',
    });
    body = body.slice(1);
  }
  // Only an introduction before the first section describes the whole page.
  const firstSection = body.findIndex((node) => node.type === 'heading');
  const intro = body
    .slice(0, firstSection < 0 ? body.length : firstSection)
    .find((node) => node.type === 'paragraph');
  const title = page.title ?? toString(heading);
  const description = page.description ?? (intro ? firstSentence(toString(intro)) : title);

  const errors = [];
  const rewrite = (url) => {
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(url)) return url;
    const hashIndex = url.indexOf('#');
    const path = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
    const resolved = path
      ? posix.normalize(posix.join(posix.dirname(page.source), path)).replace(/\/$/, '')
      : page.source;
    const checkAnchor = (source) => {
      if (hash && !headingsOf(source).has(hash))
        errors.push(`${page.source}: missing anchor #${hash} in ${source}`);
    };
    if (resolved.startsWith('../')) {
      errors.push(`${page.source}: link leaves the repository: ${url}`);
      return url;
    }
    const target = pages.get(resolved);
    if (target) {
      checkAnchor(resolved);
      return `${siteUrl(target.target)}${hash ? `#${hash}` : ''}`;
    }
    if (aliases.has(resolved)) {
      if (hash) errors.push(`${page.source}: anchors on ${resolved} have no site page`);
      return aliases.get(resolved);
    }
    const kind = kindOf(resolved);
    if (!kind) {
      errors.push(`${page.source}: broken link ${url}`);
      return url;
    }
    if (resolved.endsWith('.md')) checkAnchor(resolved);
    const view = kind === 'directory' ? 'tree' : 'blob';
    return `${repositoryUrl}/${view}/${branch}/${resolved}${hash ? `#${hash}` : ''}`;
  };
  // Links inside the removed title and navigation line are still checked, but not rewritten.
  const removed = edits.map(({ start, end }) => [start, end]);
  visit(tree, ['link', 'definition'], (node) => {
    const { start, end } = node.position;
    if (removed.some(([from, to]) => start.offset >= from && end.offset <= to)) {
      rewrite(node.url);
      return;
    }
    const raw = markdown.slice(start.offset, end.offset);
    const at = raw.lastIndexOf(node.url);
    if (at < 0) {
      errors.push(`${page.source}:${start.line}: cannot locate link destination ${node.url}`);
      return;
    }
    const next = rewrite(node.url);
    if (next !== node.url)
      edits.push({
        start: start.offset + at,
        end: start.offset + at + node.url.length,
        text: next,
      });
  });
  if (errors.length) throw new Error(errors.join('\n'));

  let output = markdown;
  for (const edit of edits.toSorted((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  // JSON strings are valid YAML scalars, so titles and descriptions need no extra escaping.
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `source: ${JSON.stringify(page.source)}`,
    '---',
    '',
  ].join('\n');
  return `${frontmatter}\n${output.trimStart()}`;
}

/** Every generated page must appear in a meta.json so new documents cannot silently disappear. */
function assertNavigation(pages) {
  const listed = new Set(['index']);
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name === 'meta.json') {
        const meta = JSON.parse(readFileSync(join(dir, entry.name), 'utf8'));
        for (const item of meta.pages ?? []) {
          if (item === '...') listed.add(`${prefix}*`);
          else if (!item.startsWith('---') && !item.startsWith('[')) listed.add(`${prefix}${item}`);
        }
      }
    }
  };
  walk(contentDir, '');
  const missing = [...pages.values()]
    .map(({ target }) => target)
    .filter((target) => {
      const folder = target.includes('/')
        ? `${target.slice(0, target.lastIndexOf('/') + 1)}*`
        : '*';
      return !listed.has(target) && !listed.has(folder) && !target.endsWith('/index');
    });
  if (missing.length)
    throw new Error(`Add these pages to a website/content/docs meta.json: ${missing.join(', ')}`);
}

function removeGenerated(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) removeGenerated(path);
    else if (entry.name.endsWith('.md')) rmSync(path);
  }
}

/** Heading anchors of repository documents, parsed once per source. */
export function createHeadingIndex() {
  const cache = new Map();
  return (source) => {
    if (!cache.has(source))
      cache.set(source, anchors(parse(readFileSync(join(root, source), 'utf8'))));
    return cache.get(source);
  };
}

export function syncDocs() {
  const pages = collectPages();
  const headingsOf = createHeadingIndex();
  const outputs = [...pages.values()].map((page) => [page, transformPage(page, pages, headingsOf)]);
  removeGenerated(contentDir);
  for (const [page, output] of outputs) {
    const file = join(contentDir, `${page.target}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, output);
  }
  assertNavigation(pages);
  return outputs.length;
}

export function watchSources() {
  let timer;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        console.log(`[sync-docs] ${syncDocs()} pages updated`);
      } catch (error) {
        console.error(`[sync-docs] ${error.message}`);
      }
    }, 100);
  };
  watch(join(root, 'docs'), { recursive: true }, run);
  for (const file of ['CONTRIBUTING.md', 'SECURITY.md'].concat(
    ['core', 'cli', 'query'].map((name) => `packages/${name}/CHANGELOG.md`),
  ))
    watch(join(root, file), run);
  console.log(`[sync-docs] watching ${relative(process.cwd(), join(root, 'docs')) || 'docs'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`[sync-docs] ${syncDocs()} pages generated`);
  if (process.argv.includes('--watch')) watchSources();
}
