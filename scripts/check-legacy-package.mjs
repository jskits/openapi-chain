import assert from 'node:assert/strict';
import spawn from 'cross-spawn';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compiler } from './lib/compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'openapi-chain-legacy-consumer-'));
const core = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const legacy = JSON.parse(readFileSync(join(root, 'packages/legacy/package.json'), 'utf8'));
const config = join(consumer, '.npmrc');
writeFileSync(config, 'registry=https://registry.npmjs.org/\n');
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key))),
  NPM_CONFIG_USERCONFIG: config,
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
  const packedCore = JSON.parse(
    run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer],
      join(root, 'packages/core'),
    ),
  )[0];
  run('pnpm', ['pack', '--pack-destination', consumer], join(root, 'packages/legacy'));
  const legacyTarball = `${legacy.name}-${legacy.version}.tgz`;
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        [core.name]: `file:./${packedCore.filename}`,
        [legacy.name]: `file:./${legacyTarball}`,
      },
    }),
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules/openapi-chain/package.json')),
  );
  assert.equal(installed.dependencies[core.name], `^${core.version}`);
  writeFileSync(
    join(consumer, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
import { createClient } from 'openapi-chain';
import { createClient as scopedClient } from '@openapi-chain/core';
import { createStrictClient } from 'openapi-chain/strict';
import { createStrictClient as scopedStrict } from '@openapi-chain/core/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import { compileOpenAPIMetadata as scopedMetadata } from '@openapi-chain/core/metadata';
assert.equal(createClient, scopedClient);
assert.equal(createStrictClient, scopedStrict);
assert.equal(compileOpenAPIMetadata, scopedMetadata);
const client = createClient({baseUrl:'https://example.test', transport:async () => new Response('{}', {headers:{'content-type':'application/json'}})});
assert.deepEqual(await client.x.get(), {});
`,
  );
  run(process.execPath, ['smoke.mjs']);
  writeFileSync(
    join(consumer, 'smoke.cjs'),
    `const assert = require('node:assert/strict');
assert.equal(require('openapi-chain').createClient, require('@openapi-chain/core').createClient);
assert.equal(require('openapi-chain/strict').createStrictClient, require('@openapi-chain/core/strict').createStrictClient);
assert.equal(require('openapi-chain/metadata').compileOpenAPIMetadata, require('@openapi-chain/core/metadata').compileOpenAPIMetadata);
`,
  );
  run(process.execPath, ['smoke.cjs']);
  const source = `import { createClient } from 'openapi-chain';
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
type Paths = {'/x': {get: {responses: {200: {content: {'application/json': {ok: true}}}}}}};
const metadata = compileOpenAPIMetadata({openapi:'3.1.0',paths:{}});
const core = createClient<Paths>({baseUrl:'https://example.test'});
const strict = createStrictClient<Paths>({baseUrl:'https://example.test',metadata});
const one: Promise<{ok:true}> = core.x.get();
const two: Promise<{ok:true}> = strict.x.get();
void one; void two;
`;
  for (const extension of ['mts', 'cts']) {
    writeFileSync(join(consumer, `smoke.${extension}`), source);
  }
  run(compiler.command, [
    ...compiler.args,
    '--noEmit',
    '--strict',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    'smoke.mts',
    'smoke.cts',
  ]);
  console.log(
    `Legacy compatibility package verified: ESM, CommonJS and ${compiler.version} declarations.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
