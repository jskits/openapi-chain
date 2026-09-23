import assert from 'node:assert/strict';
import spawn from 'cross-spawn';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compiler } from './lib/compiler.mjs';

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

  if (compiler.major === 7) {
    // Reproduce the documented dual-compiler installation in a genuinely isolated consumer.
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        packageManager: manifest.packageManager,
        dependencies: {
          [manifest.name]: `file:${join(consumer, packed.filename).replaceAll('\\', '/')}`,
        },
        devDependencies: Object.fromEntries(
          ['typescript', 'typescript7', 'openapi-typescript'].map((name) => [
            name,
            manifest.devDependencies[name],
          ]),
        ),
      }),
    );
    writeFileSync(
      join(consumer, 'pnpm-workspace.yaml'),
      `strictPeerDependencies: true
peerDependencyRules:
  allowedVersions:
    'openapi-typescript>typescript': '${manifest.devDependencies.typescript}'
`,
    );
    run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], consumer, env);
    writeFileSync(
      join(consumer, 'generated.openapi.json'),
      readFileSync(join(root, 'examples/scoped/openapi.json')),
    );
    run(process.execPath, [
      'node_modules/openapi-typescript/bin/cli.js',
      'generated.openapi.json',
      '-o',
      'generated-schema.d.ts',
    ]);
    writeFileSync(
      join(consumer, 'generated-consumer.mts'),
      `import {createClient} from '${manifest.name}';
import type {paths} from './generated-schema.js';
const api = createClient<paths>({baseUrl:'https://example.test'});
const result: Promise<{id:string;name:string}> = api.items('42').get(); void result;
// @ts-expect-error generated path parameters remain strings
api.items(42);
// @ts-expect-error nonexistent generated routes remain rejected
api.missing.get();
`,
    );
  } else {
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
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
  }
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
  document.paths['/unselected'] = {$ref:'external.json'};
  const metadata = compileOpenAPIMetadata(document, {paths:['/x/{id}']});
  assert.deepEqual(Object.keys(metadata.operations), ['/x/{id}']);
  for (const extra of [{metadata}, {middleware:[]}, {headers:()=>({authorization:'token'})}]) {
    assert.throws(() => createClient({baseUrl:'https://example.test',...extra}), {message:'Use openapi-chain/strict.'});
  }
  const compatible = compileOpenAPIMetadata({openapi:'3.1.0',paths:{
    '/x/{id}':document.paths['/x/{id}'],
    '/x/{name}':{parameters:[{name:'name',in:'path',required:true,schema:{type:'string'}}],delete:{}}
  }}, {onAmbiguousTemplate:'allow'});
  assert.equal(Object.keys(compatible.operations).length, 2);
  for (const factory of [createClient, createStrictClient]) {
    const api = factory({baseUrl:'https://example.test',...(factory === createStrictClient ? {metadata} : {}),transport:async request => {
      assert.equal(request.url, 'https://example.test/x/a%20b');
      assert.equal(request.init.method, 'GET');
      return new Response('{"ok":true}', {headers:{'content-type':'application/json'}});
    }});
    assert.deepEqual(await api.x('a b').get(), {ok:true});
    if (factory === createStrictClient) await assert.rejects(api.$path('/unselected').get(), /does not contain/);
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
import { compileOpenAPIMetadata, type CompileOpenAPIMetadataOptions } from ${metadataSpecifier};
type Paths = {'/x/{id}': {parameters:{path:{id:string}}, get:{responses:{200:{content:{'application/json':{ok:true}}}}}}};
const options = {paths: ['/x/{id}'], onAmbiguousTemplate: 'allow'} satisfies CompileOpenAPIMetadataOptions;
void options;
// @ts-expect-error only explicit compatibility modes are accepted
const invalid: CompileOpenAPIMetadataOptions = {onAmbiguousTemplate:'ignore'};
void invalid;
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
const strictTrailing = createStrictClient<{'/items/': {get: {responses: {204: {content: never}}}}}>({baseUrl:'https://example.test', metadata});
void strictTrailing.items.get();
const strictReserved = createStrictClient<{'/search/query': {get: {responses: {204: {content: never}}}}}>({baseUrl:'https://example.test', metadata});
void strictReserved.search.query.get();
`;
  for (const extension of ['mts', 'cts']) {
    writeFileSync(join(consumer, `consumer.${extension}`), typeConsumer);
  }
  run(compiler.command, [
    ...(compiler.major === 7
      ? [join(consumer, 'node_modules/typescript7/bin/tsc')]
      : compiler.args),
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
    ...(compiler.major === 7 ? ['generated-consumer.mts'] : []),
  ]);
  console.log(
    `Package verified: ${packed.filename}; ${files.length} files; ESM, CommonJS, ${compiler.version} NodeNext consumers and real HTTP passed.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
