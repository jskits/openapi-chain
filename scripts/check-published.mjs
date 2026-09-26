import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, waitForPublished } from './lib/published.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageSources = [
  ['openapi-chain', 'packages/core/package.json'],
  ['@openapi-chain/cli', 'packages/cli/package.json'],
  ['@openapi-chain/query', 'packages/query/package.json'],
];
const expected = packageSources.map(([name, path]) => {
  const manifest = JSON.parse(readFileSync(join(root, path), 'utf8'));
  assert.equal(manifest.name, name, `Unexpected package name in ${path}`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, `Invalid version in ${path}`);
  return { name, version: manifest.version };
});

function run(command, args, cwd, env, timeout = 60_000) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.error?.message ?? `exit ${result.status}`})\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  return result.stdout.trim();
}

function installedManifest(consumer, name) {
  const manifest = JSON.parse(
    readFileSync(join(consumer, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'),
  );
  const version = expected.find((pkg) => pkg.name === name)?.version;
  assert.equal(manifest.name, name, `Installed ${name} has the wrong name`);
  assert.equal(manifest.version, version, `Installed ${name} has the wrong version`);
  return manifest;
}

function smokeInstalledPackages() {
  const consumer = mkdtempSync(join(tmpdir(), 'openapi-chain-published-'));
  try {
    const userConfig = join(consumer, 'user.npmrc');
    const globalConfig = join(consumer, 'global.npmrc');
    writeFileSync(userConfig, `registry=${REGISTRY}/\n`);
    writeFileSync(globalConfig, '');
    // Use an empty cache and configuration so this tests public registry delivery.
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^npm_config_/i.test(key) && !/^(?:npm_token|node_auth_token)$/i.test(key),
        ),
      ),
      NPM_CONFIG_USERCONFIG: userConfig,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
      NPM_CONFIG_REGISTRY: REGISTRY,
      NPM_CONFIG_CACHE: join(consumer, 'npm-cache'),
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    };
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'openapi-chain-published-smoke',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(expected.map(({ name, version }) => [name, version])),
      }),
    );
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(
      npm,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        `--registry=${REGISTRY}`,
      ],
      consumer,
      env,
      5 * 60_000,
    );
    for (const { name } of expected) installedManifest(consumer, name);

    const cli = installedManifest(consumer, '@openapi-chain/cli');
    const cliRoot = join(consumer, 'node_modules', '@openapi-chain', 'cli');
    const bin = cli.bin?.['openapi-chain'];
    assert.equal(typeof bin, 'string', 'Installed CLI has no openapi-chain binary');
    const cliPath = resolve(cliRoot, bin);
    assert.ok(cliPath.startsWith(`${cliRoot}${sep}`), 'Installed CLI binary escapes its package');
    assert.equal(
      createRequire(cliPath)('openapi-chain/package.json').version,
      expected.find(({ name }) => name === 'openapi-chain').version,
      'Installed CLI resolves a different runtime version',
    );
    const runCli = (...args) => run(process.execPath, [cliPath, ...args], consumer, env);
    assert.equal(runCli('--version'), cli.version);

    const document = {
      openapi: '3.0.3',
      info: { title: 'Published consumer smoke', version: '1.0.0' },
      paths: {
        '/items/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            responses: {
              200: {
                description: 'Item',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'string' } },
                      required: ['id'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    writeFileSync(join(consumer, 'openapi.json'), JSON.stringify(document));
    writeFileSync(
      join(consumer, 'openapi-chain.config.json'),
      JSON.stringify({ schema: './openapi.json', outDir: './generated', paths: ['/items/{id}'] }),
    );
    runCli('generate', '--config', 'openapi-chain.config.json');
    runCli('generate', '--config', 'openapi-chain.config.json', '--check');
    const generated = JSON.parse(readFileSync(join(consumer, 'generated/manifest.json'), 'utf8'));
    assert.equal(generated.versions.cli, cli.version);
    assert.equal(
      generated.versions.runtime,
      expected.find(({ name }) => name === 'openapi-chain').version,
    );

    copyFileSync(
      join(root, 'scripts/fixtures/published-consumer.mjs'),
      join(consumer, 'published-consumer.mjs'),
    );
    const result = run(process.execPath, ['published-consumer.mjs'], consumer, env);
    console.log(result);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

try {
  console.log(
    `Checking exact npm versions at ${REGISTRY}: ${expected.map(({ name, version }) => `${name}@${version}`).join(', ')}`,
  );
  await waitForPublished(expected);
  console.log('All exact registry versions have integrity and provenance metadata.');
  smokeInstalledPackages();
  console.log('Published registry consumer verification passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
