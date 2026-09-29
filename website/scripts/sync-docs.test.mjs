import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPages, createHeadingIndex, repositoryUrl, transformPage } from './sync-docs.mjs';

const pages = new Map([
  ['docs/guide.md', { source: 'docs/guide.md', target: 'guide' }],
  ['docs/api.md', { source: 'docs/api.md', target: 'api' }],
  [
    'docs/archive/qualification/README.md',
    { source: 'docs/archive/qualification/README.md', target: 'archive/index' },
  ],
]);
const headings = new Map([
  ['docs/guide.md', new Set(['setup', 'usage'])],
  ['docs/api.md', new Set(['entry-points'])],
  ['docs/other.md', new Set(['kept'])],
]);
const headingsOf = (source) => headings.get(source) ?? new Set();
const files = new Map([
  ['packages/core/src/type.ts', 'file'],
  ['test/fixtures', 'directory'],
  ['docs/other.md', 'file'],
]);
const transform = (markdown, page = pages.get('docs/guide.md')) =>
  transformPage(page, pages, headingsOf, { markdown, kindOf: (path) => files.get(path) });

void test('the title, navigation line and first sentence become frontmatter', () => {
  const output = transform(
    '# Guide title\n\n[Index](README.md) · [API](api.md)\n\nFirst `code` sentence. Second one.\n\n## Setup\n',
  );
  assert.equal(
    output,
    '---\ntitle: "Guide title"\ndescription: "First code sentence."\nsource: "docs/guide.md"\n---\n\n' +
      'First `code` sentence. Second one.\n\n## Setup\n',
  );
});

void test('links map to site pages, the docs index and GitHub', () => {
  const output = transform(
    [
      '# Guide',
      '',
      'Read [the API](api.md#entry-points), [the index](README.md), [itself](#usage),',
      '[types](../packages/core/src/type.ts), [fixtures](../test/fixtures/),',
      '[an archive](archive/qualification/README.md), [kept](other.md#kept) and',
      '[npm](https://www.npmjs.com/package/openapi-chain).',
      '',
      '[reference]: api.md',
      '',
    ].join('\n'),
  );
  assert.match(output, /\[the API\]\(\/docs\/api#entry-points\)/);
  assert.match(output, /\[the index\]\(\/docs\)/);
  assert.match(output, /\[itself\]\(\/docs\/guide#usage\)/);
  assert.match(
    output,
    new RegExp(`\\[types\\]\\(${repositoryUrl}/blob/main/packages/core/src/type\\.ts\\)`),
  );
  assert.match(output, new RegExp(`\\[fixtures\\]\\(${repositoryUrl}/tree/main/test/fixtures\\)`));
  assert.match(output, /\[an archive\]\(\/docs\/archive\)/);
  assert.match(
    output,
    new RegExp(`\\[kept\\]\\(${repositoryUrl}/blob/main/docs/other\\.md#kept\\)`),
  );
  assert.match(output, /\[npm\]\(https:\/\/www\.npmjs\.com\/package\/openapi-chain\)/);
  assert.match(output, /^\[reference\]: \/docs\/api$/m);
});

void test('code is copied unchanged', () => {
  const code = '```md\n[not a link](api.md)\n```\n\nUse `[inline](api.md)` text.\n';
  assert.ok(transform(`# Guide\n\nIntro.\n\n${code}`).endsWith(code));
});

void test('broken links and anchors fail the sync', () => {
  assert.throws(() => transform('# Guide\n\n[missing](nope.md)\n'), /broken link nope\.md/);
  assert.throws(
    () => transform('# Guide\n\n[bad](api.md#nope)\n'),
    /missing anchor #nope in docs\/api\.md/,
  );
  assert.throws(
    () => transform('# Guide\n\n[self](#nope)\n'),
    /missing anchor #nope in docs\/guide\.md/,
  );
  assert.throws(() => transform('# Guide\n\n[out](../../x.md)\n'), /leaves the repository/);
  assert.throws(() => transform('# Guide\n\n[index](README.md#x)\n'), /have no site page/);
  assert.throws(() => transform('Intro without a title.\n'), /level-1 heading/);
});

void test('every repository document transforms without broken links or anchors', () => {
  const all = collectPages();
  const headingsOfRepository = createHeadingIndex();
  assert.ok(all.size > 20);
  for (const page of all.values()) transformPage(page, all, headingsOfRepository);
});
