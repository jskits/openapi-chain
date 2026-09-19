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
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts',
    'dist/index.d.cts',
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
  run(process.execPath, [
    '--input-type=module',
    '-e',
    `import * as library from ${specifier}; if (!library) throw new Error('ESM import failed');`,
  ]);
  run(process.execPath, [
    '--input-type=commonjs',
    '-e',
    `const library = require(${specifier}); if (!library) throw new Error('CJS require failed');`,
  ]);
  writeFileSync(
    join(consumer, 'consumer.mts'),
    `import * as library from ${specifier};\nvoid library;\n`,
  );
  writeFileSync(
    join(consumer, 'consumer.cts'),
    `import library = require(${specifier});\nvoid library;\n`,
  );
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
    `Package verified: ${packed.filename}; ${files.length} files; ESM, CommonJS and NodeNext declarations resolve.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
