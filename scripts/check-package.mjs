import assert from 'node:assert/strict';
import spawn from 'cross-spawn';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'openapi-chain-consumer-'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function run(command, args, cwd = consumer, env = process.env) {
  const result = spawn.sync(command, args, { cwd, env, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

try {
  // Use npm's pack format without inherited user settings or lifecycle recursion.
  const npmConfig = join(consumer, '.npmrc');
  const npmGlobalConfig = join(consumer, 'global.npmrc');
  writeFileSync(npmConfig, 'registry=https://registry.npmjs.org/\n');
  writeFileSync(npmGlobalConfig, '');
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)),
    ),
    NPM_CONFIG_USERCONFIG: npmConfig,
    NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
  };
  const [packed] = JSON.parse(
    run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer], root, env),
  );
  const files = packed.files.map(({ path }) => path);
  for (const required of [
    ...['index', 'strict', 'metadata'].flatMap((entry) =>
      ['js', 'cjs', 'd.ts', 'd.cts'].map((extension) => `dist/${entry}.${extension}`),
    ),
    'README.md',
    'LICENSE',
  ]) {
    assert.ok(files.includes(required), `Missing package file: ${required}`);
  }
  assert.ok(
    files.every(
      (path) =>
        path.startsWith('dist/') ||
        ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'].includes(path),
    ),
    'Unexpected file in published package',
  );

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      join(consumer, packed.filename),
    ],
    consumer,
    env,
  );
  const specifier = JSON.stringify(manifest.name);
  const strictSpecifier = JSON.stringify(`${manifest.name}/strict`);
  const metadataSpecifier = JSON.stringify(`${manifest.name}/metadata`);
  const behavior = `
const assert = require('node:assert/strict');
async function main() {
  const document = {openapi:'3.2.1', paths:{'/x/{id}':{
    parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],
    get:{responses:{200:{description:'ok'}}}
  }}};
  const metadata = compileOpenAPIMetadata(document);
  for (const factory of [createClient, createStrictClient]) {
    const api = factory({baseUrl:'https://example.test',metadata,transport:async request => {
      assert.equal(request.url, 'https://example.test/x/a%20b');
      assert.equal(request.init.method, 'GET');
      return new Response('{"ok":true}', {headers:{'content-type':'application/json'}});
    }});
    assert.deepEqual(await api.x('a b').get(), {ok:true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`;
  for (const mode of ['esm', 'cjs']) {
    const imports =
      mode === 'esm'
        ? `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { createClient } from ${specifier};
import { createStrictClient } from ${strictSpecifier};
import { compileOpenAPIMetadata } from ${metadataSpecifier};
`
        : `const { createClient } = require(${specifier});
const { createStrictClient } = require(${strictSpecifier});
const { compileOpenAPIMetadata } = require(${metadataSpecifier});
`;
    const filename = mode === 'esm' ? 'smoke.mjs' : 'smoke.cjs';
    writeFileSync(join(consumer, filename), imports + behavior);
    run(process.execPath, [filename]);
  }
  for (const fixture of ['conformance.openapi.json', 'conformance-schema.d.ts']) {
    writeFileSync(join(consumer, fixture), readFileSync(join(root, 'test/fixtures', fixture)));
  }
  writeFileSync(
    join(consumer, 'packed-http.mjs'),
    readFileSync(join(root, 'scripts/fixtures/packed-http.mjs')),
  );
  run(process.execPath, ['packed-http.mjs']);
  const typeConsumer = `import { createClient, type OperationExtensionsFor } from ${specifier};
import { createStrictClient } from ${strictSpecifier};
import { compileOpenAPIMetadata } from ${metadataSpecifier};
type Paths = {'/x/{id}': {parameters:{path:{id:string}}, get:{responses:{200:{content:{'application/json':{ok:true}}}}}}};
const metadata = compileOpenAPIMetadata({openapi:'3.2.1',paths:{}});
const core = createClient<Paths>({baseUrl:'https://example.test'});
const strict = createStrictClient<Paths>({baseUrl:'https://example.test',metadata});
const extension = {path: value => value.toUpperCase()} satisfies OperationExtensionsFor<Paths, '/x/{id}', 'get'>;
const result: Promise<{ok:true}> = core.x('id').get({extensions:extension});
const strictResult: Promise<{ok:true}> = strict.x('id').get();
// @ts-expect-error path arguments preserve the schema type
core.x(123);
void result; void strictResult;
import type { paths as CorpusPaths } from './conformance-schema.js';
const corpus = createClient<CorpusPaths>({baseUrl:'https://example.test'});
void corpus.$path('/echo/{id}/', {id:'a/b'}).get();
// @ts-expect-error generated query remains required in installed declarations
void corpus.search.get();
// @ts-expect-error significant trailing slash cannot expose a chain method
const trailing = createClient<{'/items/': CorpusPaths['/echo/{id}/']}>({baseUrl:'https://example.test'}).items.get;
void trailing;
`;
  for (const extension of ['mts', 'cts']) {
    writeFileSync(join(consumer, `consumer.${extension}`), typeConsumer);
  }
  run(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    'consumer.mts',
    'consumer.cts',
  ]);
  console.log(
    `Package verified: ${packed.filename}; ${files.length} files; ESM, CommonJS, generated NodeNext consumers and real HTTP passed.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
