import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import { build } from 'tsdown';
import { compiler } from './lib/compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'openapi-chain-query-consumer-'));
const workspace = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = {
  ...JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8')),
  devDependencies: workspace.devDependencies,
  packageManager: workspace.packageManager,
};
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
try {
  const pack = (cwd) =>
    JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer], cwd),
    )[0];
  const runtime = pack(join(root, 'packages/core'));
  const adapter = pack(join(root, 'packages/query'));
  assert.ok(adapter.files.some((file) => file.path === 'LICENSE'));
  assert.ok(
    !adapter.files.some((file) => file.path.startsWith('src/') || file.path.startsWith('test/')),
  );
  assert.ok(!runtime.files.some((file) => file.path.startsWith('query/')));
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        '@openapi-chain/core': `file:./${runtime.filename}`,
        '@openapi-chain/query': `file:./${adapter.filename}`,
        ...Object.fromEntries(
          ['@tanstack/react-query', 'swr', 'react', '@types/react'].map((name) => [
            name,
            manifest.devDependencies[name],
          ]),
        ),
      },
    }),
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules/@openapi-chain/query/package.json'), 'utf8'),
  );
  assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
  for (const extension of ['mts', 'cts'])
    writeFileSync(
      join(consumer, `consumer.${extension}`),
      readFileSync(join(root, 'scripts/fixtures/query-consumer.ts')),
    );
  run(compiler.command, [
    ...compiler.args,
    '--noEmit',
    '--strict',
    '--exactOptionalPropertyTypes',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    'consumer.mts',
    'consumer.cts',
  ]);
  writeFileSync(
    join(consumer, 'runtime.mjs'),
    readFileSync(join(root, 'scripts/fixtures/query-consumer.mjs')),
  );
  run(process.execPath, ['runtime.mjs']);
  const entry = join(consumer, 'browser.mjs');
  writeFileSync(
    entry,
    `import { createQuery } from '@openapi-chain/query';\nexport const item = createQuery({key:['scope','GET','/items/{id}'], fetcher: async input => input});\n`,
  );
  const modules = new Set();
  await build({
    config: false,
    entry: [entry],
    outDir: join(consumer, 'browser'),
    platform: 'browser',
    format: 'esm',
    dts: false,
    sourcemap: false,
    minify: true,
    deps: { alwaysBundle: [/@openapi-chain\/query/] },
    plugins: [
      {
        name: 'inspect-query-consumer',
        moduleParsed(info) {
          modules.add(info.id);
        },
      },
    ],
  });
  assert.ok(
    [...modules].some((id) => id.replaceAll('\\', '/').includes('@openapi-chain/query/dist/')),
  );
  assert.ok(![...modules].some((id) => /node:|(?:react|swr|msw|typescript|yaml)[/\\]/.test(id)));
  console.log(
    `Query adapter verified: isolated ESM/CommonJS, ${compiler.version} TanStack/SWR types, real HTTP/cache/errors and dependency-free browser bundle.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
