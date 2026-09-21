import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import spawn from 'cross-spawn';

const require = createRequire(import.meta.url);
const pins = { ts6: ['typescript', '6.0.3'], ts7: ['typescript7', '7.0.2'] };
// Keep separate budgets: compiler counters are not a cross-version invariant.
const budgets = {
  6: { instantiations: 3_000_000, memoryKB: 1_200_000 },
  7: { instantiations: 3_000_000, memoryKB: 1_200_000 },
};
const selection = process.argv.find((arg) => arg.startsWith('--compiler='))?.split('=')[1];
assert.ok(
  selection === undefined || Object.hasOwn(pins, selection),
  'Use --compiler=ts6 or --compiler=ts7.',
);
// Named checks always use their pinned compiler, even when a developer has set an override.
const external = selection === undefined ? process.env.OPENAPI_CHAIN_TSC : undefined;
const [name, expected] = pins[selection ?? 'ts6'];
const packagePath = require.resolve(`${name}/package.json`);
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
if (!external) assert.equal(pkg.version, expected, `Unexpected ${name} version`);
const command = external ?? process.execPath;
const args = external ? [] : [join(dirname(packagePath), pkg.bin.tsc)];
const result = spawn.sync(command, [...args, '--version'], { encoding: 'utf8' });
assert.equal(result.status, 0, `Cannot run compiler: ${result.stderr ?? result.error}`);
const version = result.stdout.trim();
const major = Number(/^Version (\d+)\./.exec(version)?.[1]);
assert.ok(major === 6 || major === 7, `Unsupported benchmark compiler: ${version}`);
if (external) assert.equal(major, 7, 'OPENAPI_CHAIN_TSC is for native TS 7 comparisons.');
export const compiler = {
  command,
  args,
  version,
  major,
  budget: budgets[major],
  benchmarkArgs: major === 7 ? ['--checkers', '4'] : [],
  server:
    major === 7
      ? { command, args: [...args, '--lsp', '--stdio'] }
      : {
          command: process.execPath,
          args: [
            join(dirname(packagePath), 'lib/tsserver.js'),
            '--disableAutomaticTypingAcquisition',
          ],
        },
};
export function compilerInfo() {
  return {
    compiler: version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    budget: compiler.budget,
    checkers: major === 7 ? 4 : 1,
  };
}
