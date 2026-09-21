import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

const probe = `const {compiler, compilerInfo} = await import('./scripts/lib/compiler.mjs');
console.log(JSON.stringify({...compilerInfo(), command:compiler.command, args:compiler.args, benchmarkArgs:compiler.benchmarkArgs}));`;

test.each([
  ['ts6', '6.0.3', []],
  ['ts7', '7.0.2', ['--checkers', '4']],
] as const)(
  'the %s check uses its pinned compiler despite a conflicting executable override',
  (selector, version, benchmarkArgs) => {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', probe, '--', `--compiler=${selector}`],
      {
        encoding: 'utf8',
        env: { ...process.env, OPENAPI_CHAIN_TSC: '/nonexistent/compiler' },
      },
    );
    expect(result.status).toBe(0);
    const info = JSON.parse(result.stdout) as {
      compiler: string;
      command: string;
      args: string[];
      benchmarkArgs: string[];
    };
    expect(info.compiler).toBe(`Version ${version}`);
    expect(info.command).toBe(process.execPath);
    expect(info.args).toHaveLength(1);
    expect(info.benchmarkArgs).toEqual(benchmarkArgs);
  },
);

test('unknown compiler selection fails instead of silently benchmarking another version', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', probe, '--', '--compiler=typo'],
    { encoding: 'utf8' },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Use --compiler=ts6 or --compiler=ts7');
});
