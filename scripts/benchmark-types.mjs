import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import { compiler, compilerInfo } from './lib/compiler.mjs';
console.log(JSON.stringify(compilerInfo()));

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-types-'));
try {
  for (const count of [100, 1000, 5000]) {
    const entries = Array.from(
      { length: count },
      (_, i) => `'/r${i}/{id}': {
      parameters: { path: { id: string }; query?: never; header?: never; cookie?: never };
      get: { parameters: { query: { q: string }; path?: never; header?: never; cookie?: never };
      requestBody?: never; responses: { 200: { content: { 'application/json': { ok: true } } } } };
    };`,
    ).join('\n');
    const uses = Array.from(
      { length: 25 },
      (_, i) =>
        `const r${i}: Promise<{ok:true}> = api.r${Math.floor((i * count) / 25)}('id').get({query:{q:'x'}}); void r${i};`,
    ).join('\n');
    const specifier = JSON.stringify(join(root, 'dist/index.js').replaceAll('\\', '/'));
    writeFileSync(
      join(directory, 'consumer.mts'),
      `import {createClient} from ${specifier};
type Paths = {${entries}};
const api = createClient<Paths>({baseUrl:'https://example.test'});
${uses}
// @ts-expect-error required query cannot be omitted
api.r0('id').get();
// @ts-expect-error path argument remains string
api.r0(1);
`,
    );
    const result = spawn.sync(
      compiler.command,
      [
        ...compiler.args,
        ...compiler.benchmarkArgs,
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--module',
        'NodeNext',
        '--target',
        'ES2022',
        '--extendedDiagnostics',
        'consumer.mts',
      ],
      { cwd: directory, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const instantiations = Number(/Instantiations:\s+(\d+)/.exec(result.stdout)?.[1]);
    const memoryKB = Number(/Memory used:\s+(\d+)K/.exec(result.stdout)?.[1]);
    assert.ok(
      instantiations > 0 && instantiations < compiler.budget.instantiations,
      `Type complexity budget exceeded: ${instantiations}`,
    );
    assert.ok(
      memoryKB > 0 && memoryKB < compiler.budget.memoryKB,
      `Type memory budget exceeded: ${memoryKB} KB`,
    );
    console.log(
      JSON.stringify({
        routes: count,
        usedOperations: 25,
        instantiations,
        memoryKB,
        checkTime: /Check time:\s+(\S+)/.exec(result.stdout)?.[1],
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
