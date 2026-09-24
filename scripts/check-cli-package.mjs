import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'node:http';
import spawn from 'cross-spawn';
import { build } from 'tsdown';
import { compiler } from './lib/compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'openapi-chain-cli-consumer-'));
const workspace = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = {
  ...JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8')),
  devDependencies: workspace.devDependencies,
  packageManager: workspace.packageManager,
};
const cliManifest = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8'));
const npmrc = join(consumer, '.npmrc');
const globalConfig = join(consumer, 'global.npmrc');
writeFileSync(npmrc, 'registry=https://registry.npmjs.org/\n');
writeFileSync(globalConfig, '');
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key))),
  NPM_CONFIG_USERCONFIG: npmrc,
  NPM_CONFIG_GLOBALCONFIG: globalConfig,
  NPM_CONFIG_IGNORE_SCRIPTS: 'true',
};
function run(command, args, cwd = consumer) {
  const result = spawn.sync(command, args, { cwd, env, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}
let server;
try {
  const [packed] = JSON.parse(
    run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer],
      join(root, 'packages/core'),
    ),
  );
  run('pnpm', ['pack', '--pack-destination', consumer], join(root, 'packages/cli'));
  const cliTarball = `${cliManifest.name.replace(/^@/, '').replace('/', '-')}-${cliManifest.version}.tgz`;
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: { 'openapi-chain': `file:./${packed.filename}` },
      devDependencies: {
        '@openapi-chain/cli': `file:./${cliTarball}`,
        typescript: manifest.devDependencies.typescript,
      },
      pnpm: {
        overrides: {
          'openapi-chain': `file:${join(consumer, packed.filename).replaceAll('\\', '/')}`,
        },
      },
    }),
  );
  if (compiler.major === 7)
    run('pnpm', [
      'install',
      '--ignore-scripts',
      '--no-frozen-lockfile',
      '--strict-peer-dependencies',
    ]);
  else run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const runCli = (...args) =>
    compiler.major === 7
      ? run('pnpm', ['exec', 'openapi-chain', ...args])
      : run('npm', ['exec', '--offline', '--', 'openapi-chain', ...args]);
  const cliRequire = createRequire(join(consumer, 'node_modules/@openapi-chain/cli/src/cli.mjs'));
  assert.equal(
    readFileSync(cliRequire.resolve('openapi-chain/metadata'), 'utf8'),
    readFileSync(join(root, 'packages/core/dist/metadata.cjs'), 'utf8'),
  );
  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules/@openapi-chain/cli/package.json'), 'utf8'),
  );
  assert.equal(installed.dependencies['openapi-chain'], `^${manifest.version}`);
  assert.equal(installed.bin['openapi-chain'], 'src/cli.mjs');
  assert.ok(
    readFileSync(join(consumer, 'node_modules/@openapi-chain/cli/LICENSE'), 'utf8').includes('MIT'),
  );
  assert.ok(!readdirSync(join(consumer, 'node_modules/@openapi-chain/cli')).includes('test'));
  assert.ok(!packed.files.some(({ path }) => path.startsWith('cli/')));
  assert.equal(runCli('--version').trim(), cliManifest.version);
  const sourceDocument = JSON.parse(
    readFileSync(join(root, 'examples/scoped/openapi.json'), 'utf8'),
  );
  sourceDocument.paths['/items'].get.parameters.push({
    name: '__proto__',
    in: 'query',
    required: true,
    schema: { type: 'string' },
  });
  writeFileSync(join(consumer, 'openapi.json'), JSON.stringify(sourceDocument));
  writeFileSync(
    join(consumer, 'openapi-chain.config.json'),
    JSON.stringify({
      schema: './openapi.json',
      outDir: './generated',
      paths: ['/items', '/items/{id}'],
    }),
  );
  runCli('generate');
  runCli('generate', '--check');
  const provenance = JSON.parse(readFileSync(join(consumer, 'generated/manifest.json'), 'utf8'));
  assert.equal(provenance.versions.typescript, '5.9.3');
  assert.equal(provenance.versions.runtime, manifest.version);
  writeFileSync(
    join(consumer, 'client.ts'),
    `import {createStrictClient} from 'openapi-chain/strict';
import type {Transport} from 'openapi-chain';
import type {ScopedPaths} from './generated/scope.js';
import {metadata} from './generated/metadata.js';
export const createCatalog = (baseUrl: string, transport?: Transport) => createStrictClient<ScopedPaths>({baseUrl, metadata, ...(transport ? {transport} : {})});
`,
  );
  writeFileSync(
    join(consumer, 'contract.ts'),
    `import {createCatalog} from './client.js';
const api = createCatalog('https://api.test');
void api.items.get({query:{filter:{name:'book'},['__proto__']:'value'}});
// @ts-expect-error generated prototype-like names remain required
void api.items.get({query:{filter:{name:'book'}}});
void api.items('42').get();
// @ts-expect-error unselected paths are absent
void api.admin.get();
// @ts-expect-error exact paths share the generated scope
void api.$path('/admin').get();
// @ts-expect-error generated parameter types are retained
void api.items(42).get();
// @ts-expect-error generated query fields are retained
void api.items.get({query:{unknown:'x'}});
`,
  );
  const tsArgs = [
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target',
    'es2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    'client.ts',
    'contract.ts',
  ];
  // The installed compiler proves isolation from the repository toolchain.
  run(process.execPath, ['node_modules/typescript/bin/tsc', ...tsArgs]);
  if (compiler.major === 7) run(compiler.command, [...compiler.args, ...tsArgs]);
  const modules = new Set();
  const outDir = join(consumer, 'bundle');
  await build({
    config: false,
    entry: { client: join(consumer, 'client.ts') },
    outDir,
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
        name: 'verify-installed-module-boundaries',
        transform(_code, id) {
          modules.add(id.replaceAll('\\', '/'));
        },
      },
    ],
  });
  for (const id of modules) {
    assert.ok(
      !/\/node_modules\/(?:@openapi-chain\/cli|openapi-typescript|yaml|typescript)\/|\/dist\/metadata\.|\/openapi\.json|\/schema\.d\.ts/.test(
        id,
      ),
      `Build-time module leaked: ${id}`,
    );
  }
  const source = readFileSync(join(outDir, 'client.js'), 'utf8');
  for (const marker of ['/admin', 'UNSELECTED_OPERATION', 'BUILD_ONLY_OPENAPI_DOCUMENT'])
    assert.ok(!source.includes(marker));
  const { createCatalog } = await import(pathToFileURL(join(outDir, 'client.js')).href);
  const received = [];
  server = createServer((request, response) => {
    received.push(request.url);
    response.setHeader('content-type', 'application/json');
    response.end('{"id":"42","name":"book"}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const api = createCatalog(`http://127.0.0.1:${server.address().port}`);
  await assert.rejects(
    api.items.get({ query: { filter: { name: 'book' } } }),
    /Missing required.*__proto__/,
  );
  assert.equal(received.length, 0);
  await api.items.get({ query: { filter: { name: 'book' }, ['__proto__']: 'value' } });
  assert.equal((await api.items('42').get()).name, 'book');
  await assert.rejects(api.$path('/admin').get(), /does not contain/);
  assert.deepEqual(received, ['/items?filter%5Bname%5D=book&__proto__=value', '/items/42']);
  console.log(
    `Installed CLI verified: npm bin, full generation/check, private TS 5.9 generator, TS 6${compiler.major === 7 ? '/7' : ''} scoped consumer, browser module isolation and real HTTP.`,
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  rmSync(consumer, { recursive: true, force: true });
}
