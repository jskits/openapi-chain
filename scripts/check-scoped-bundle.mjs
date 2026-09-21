import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'tsdown';

const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-scoped-bundle-'));
const modules = new Set();
try {
  await build({
    config: false,
    entry: { entry: fileURLToPath(new URL('../examples/scoped/client.ts', import.meta.url)) },
    outDir: directory,
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    deps: { alwaysBundle: /.*/ },
    minify: true,
    dts: false,
    sourcemap: false,
    publint: false,
    attw: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'record-runtime-modules',
        transform(_code, id) {
          modules.add(id);
        },
      },
    ],
  });
  assert.deepEqual(readdirSync(directory), ['entry.js']);
  assert.ok(
    ![...modules].some(
      (id) =>
        id.endsWith('/src/metadata.ts') ||
        id.endsWith('/openapi.json') ||
        id.endsWith('/schema.d.ts'),
    ),
    `Build-only modules leaked into browser bundle: ${JSON.stringify([...modules])}`,
  );
  const source = readFileSync(join(directory, 'entry.js'), 'utf8');
  for (const marker of ['BUILD_ONLY_OPENAPI_DOCUMENT', 'UNSELECTED_OPERATION', '/admin'])
    assert.ok(!source.includes(marker));
  const { createCatalog } = await import(pathToFileURL(join(directory, 'entry.js')).href);
  const requests = [];
  const api = createCatalog('https://api.test', async (request) => {
    requests.push(request.url);
    return new Response('{"id":"42","name":"book"}', {
      headers: { 'content-type': 'application/json' },
    });
  });
  await api.items.get({ query: { filter: { name: 'book' } } });
  assert.equal((await api.items('42').get()).id, '42');
  assert.deepEqual(requests, [
    'https://api.test/items?filter%5Bname%5D=book',
    'https://api.test/items/42',
  ]);
  await assert.rejects(api.$path('/admin').get(), /does not contain/);
  assert.equal(requests.length, 2);
  console.log(
    'Scoped browser-target bundle executes selected routes and excludes schema/compiler/unselected metadata.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
