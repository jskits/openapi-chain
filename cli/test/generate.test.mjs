import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate } from '../src/generate.mjs';

const document = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1' },
  paths: {
    '/items': { $ref: '#/paths/~1shared' },
    '/shared': {
      get: {
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/admin': { get: { responses: { 204: { description: 'No content' } } } },
  },
};
async function fixture(t, config = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'openapi-chain-cli-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'openapi.json');
  const path = join(dir, 'config.json');
  await writeFile(input, JSON.stringify(document));
  await writeFile(
    path,
    JSON.stringify({
      schema: './openapi.json',
      outDir: './generated',
      paths: ['/items'],
      ...config,
    }),
  );
  return { dir, input, config: path, output: join(dir, 'generated') };
}
const files = ['manifest.json', 'metadata.ts', 'schema.d.ts', 'scope.ts'];
async function snapshot(directory) {
  return Promise.all(
    files.map(async (file) => [
      file,
      await readFile(join(directory, file), 'utf8'),
      (await stat(join(directory, file))).mtimeMs,
    ]),
  );
}

await test('one source generates scoped metadata and full referenced types reproducibly', async (t) => {
  const f = await fixture(t);
  const result = await generate(f.config);
  assert.deepEqual(result.selectedPaths, ['/items']);
  assert.match(result.outputs['schema.d.ts'], /"\/shared"/);
  assert.match(result.outputs['scope.ts'], /Pick<paths/);
  assert.doesNotMatch(result.outputs['metadata.ts'], /\/admin|\/shared/);
  const manifest = JSON.parse(result.outputs['manifest.json']);
  assert.equal(manifest.versions.typescript, '5.9.3');
  assert.equal(manifest.versions.generator, '7.13.0');
  assert.equal(Object.keys(manifest.artifacts).length, 3);
  const first = await snapshot(f.output);
  assert.equal((await generate(f.config)).changed, false);
  await generate(f.config, { check: true });
  assert.deepEqual(await snapshot(f.output), first);
});

await test('check is read-only for missing, modified and outdated artifacts', async (t) => {
  const f = await fixture(t);
  await assert.rejects(generate(f.config, { check: true }), /stale or missing/);
  assert.deepEqual((await readdir(f.dir)).sort(), ['config.json', 'openapi.json']);
  await generate(f.config);
  for (const file of files) {
    const path = join(f.output, file);
    const original = await readFile(path, 'utf8');
    await writeFile(path, original + '\n');
    const before = await snapshot(f.output);
    await assert.rejects(generate(f.config, { check: true }), /stale or missing/);
    assert.deepEqual(await snapshot(f.output), before);
    await writeFile(path, original);
  }
  const before = await snapshot(f.output);
  await writeFile(
    f.input,
    JSON.stringify({ ...document, info: { title: 'Changed', version: '1' } }),
  );
  await assert.rejects(generate(f.config, { check: true }), /stale or missing/);
  assert.deepEqual(await snapshot(f.output), before);
  assert.equal((await generate(f.config)).changed, true);
  await generate(f.config, { check: true });
});

await test('scope changes invalidate all affected outputs and an empty scope stays empty', async (t) => {
  const f = await fixture(t);
  await generate(f.config);
  await writeFile(
    f.config,
    JSON.stringify({ schema: './openapi.json', outDir: './generated', paths: [] }),
  );
  await assert.rejects(generate(f.config, { check: true }), /stale or missing/);
  assert.deepEqual((await generate(f.config)).selectedPaths, []);
  await generate(f.config, { check: true });
  await writeFile(f.config, JSON.stringify({ schema: './openapi.json', outDir: './generated' }));
  assert.deepEqual((await generate(f.config)).selectedPaths, ['/items', '/shared', '/admin']);
});

await test('JSON and YAML support identical local reference semantics', async (t) => {
  const f = await fixture(t, { schema: './openapi.yaml' });
  await writeFile(
    join(f.dir, 'openapi.yaml'),
    `openapi: 3.1.0\ninfo: {title: Test, version: '1'}\npaths:\n  /items:\n    $ref: '#/paths/~1shared'\n  /shared:\n    get:\n      responses:\n        '200':\n          description: OK\n`,
  );
  assert.deepEqual((await generate(f.config)).selectedPaths, ['/items']);
  await generate(f.config, { check: true });
});

/** @type {Array<[string, Record<string, unknown>, RegExp]>} */
const invalidConfigs = [
  ['unknown option', { path: [] }, /Unknown config field/],
  ['unknown path', { paths: ['/missing'] }, /Unknown selected OpenAPI path/],
  ['invalid paths', { paths: 'all' }, /paths must/],
  ['remote input', { schema: 'https://example.test/schema.json' }, /local file/],
  ['output overlap', { outDir: '.' }, /must not contain/],
  ['invalid policy', { onAmbiguousTemplate: 'ignore' }, /onAmbiguousTemplate/],
];
for (const [name, config, message] of invalidConfigs)
  await test(`rejects ${name} without outputs`, async (t) => {
    const f = await fixture(t, config);
    await assert.rejects(generate(f.config), message);
    assert.deepEqual((await readdir(f.dir)).sort(), ['config.json', 'openapi.json']);
  });

await test('rejects external references even on unselected paths without network access', async (t) => {
  const f = await fixture(t);
  for (const ref of ['https://127.0.0.1:1/schema.json', './other.json#/paths/~1x']) {
    await writeFile(
      f.input,
      JSON.stringify({ ...document, paths: { ...document.paths, '/remote': { $ref: ref } } }),
    );
    await assert.rejects(generate(f.config), /External \$ref/);
  }
});

await test('unsupported versions, invalid YAML and cyclic aliases fail before writing', async (t) => {
  const f = await fixture(t, { schema: './schema.yaml' });
  for (const source of [
    'openapi: 3.2.0',
    'openapi: 3.1.0\nopenapi: 3.0.0',
    'openapi: 3.1.0\nx-cycle: &a { child: *a }',
  ]) {
    await writeFile(join(f.dir, 'schema.yaml'), source);
    await assert.rejects(generate(f.config));
  }
  assert.ok(!(await readdir(f.dir)).includes('generated'));
});

await test('failed generation preserves existing outputs; refuses unrelated files and locks', async (t) => {
  const f = await fixture(t);
  await generate(f.config);
  const before = await snapshot(f.output);
  await writeFile(f.input, '{');
  await assert.rejects(generate(f.config));
  assert.deepEqual(await snapshot(f.output), before);
  await writeFile(f.input, JSON.stringify(document));
  await writeFile(join(f.output, 'keep.txt'), 'user data');
  await assert.rejects(generate(f.config), /unrelated files/);
  assert.equal(await readFile(join(f.output, 'keep.txt'), 'utf8'), 'user data');
  await rm(join(f.output, 'keep.txt'));
  await writeFile(`${f.output}.openapi-chain.lock`, 'other writer');
  await assert.rejects(generate(f.config), /Generation lock exists/);
  assert.equal(await readFile(`${f.output}.openapi-chain.lock`, 'utf8'), 'other writer');
});

await test('CLI works from another cwd, reports errors and offers help/version', async (t) => {
  const f = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(run('--help').status, 0);
  assert.equal(
    run('--version').stdout.trim(),
    JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version,
  );
  assert.notEqual(run('generate', '--unknown').status, 0);
  assert.notEqual(run('invalid').status, 0);
  assert.equal(run('generate', '--config', f.config).status, 0);
  assert.equal(run('generate', '--config', f.config, '--check').status, 0);
});

await test(
  'symlinked output directories are refused',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = await fixture(t);
    await symlink(f.dir, f.output, 'dir');
    await assert.rejects(generate(f.config), /must not contain|symlink/);
  },
);

await test('output is relocatable and CRLF normalization preserves provenance', async (t) => {
  const a = await fixture(t);
  const b = await fixture(t);
  const source = JSON.stringify(document, null, 2) + '\n';
  await writeFile(a.input, source);
  await writeFile(b.input, source.replaceAll('\n', '\r\n'));
  assert.deepEqual((await generate(a.config)).outputs, (await generate(b.config)).outputs);
});

await test('missing managed artifacts can be regenerated without accepting an unowned directory', async (t) => {
  const f = await fixture(t);
  await generate(f.config);
  await rm(join(f.output, 'scope.ts'));
  await assert.rejects(generate(f.config, { check: true }), /scope.ts/);
  assert.equal((await generate(f.config)).changed, true);
  await generate(f.config, { check: true });
  await writeFile(join(f.output, 'manifest.json'), '{}');
  await assert.rejects(generate(f.config), /not owned/);
  assert.equal(await readFile(join(f.output, 'manifest.json'), 'utf8'), '{}');
});

await test('ambiguous hierarchy policy is explicit and survives full type generation', async (t) => {
  const f = await fixture(t, { paths: ['/x/{id}', '/x/{name}'] });
  const path = (name) => ({
    get: {
      parameters: [{ name, in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' } },
    },
  });
  await writeFile(
    f.input,
    JSON.stringify({ ...document, paths: { '/x/{id}': path('id'), '/x/{name}': path('name') } }),
  );
  await assert.rejects(generate(f.config), /same templated hierarchy/);
  const config = JSON.parse(await readFile(f.config, 'utf8'));
  await writeFile(f.config, JSON.stringify({ ...config, onAmbiguousTemplate: 'allow' }));
  assert.deepEqual((await generate(f.config)).selectedPaths, ['/x/{id}', '/x/{name}']);
});
