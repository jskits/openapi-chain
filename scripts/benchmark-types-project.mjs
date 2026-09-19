import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-project-types-'));
const routes = 1000;
const usedOperations = 200;
try {
  const entries = Array.from(
    { length: routes },
    (_, i) => `
    '/orgs/{org}/resources/r${i}/{id}': {
      parameters: { path: { org: string; id: string } };
      get: {
        parameters: { query: { expand: 'owner' | 'events'; cursor?: string } };
        responses: {
          200: { content: { 'application/json': Entity } };
          202: { content: { 'application/json': Pending } };
          404: { content: { 'application/json': { error: string } } };
        };
      };
    };`,
  ).join('\n');
  const uses = Array.from(
    { length: usedOperations },
    (_, i) => `
    const result${i}: Promise<Entity | Pending> = api.orgs('org').resources.r${i * 5}('id').get({query:{expand:'owner'}});
    void result${i};`,
  ).join('\n');
  const specifier = JSON.stringify(join(root, 'dist/index.js').replaceAll('\\', '/'));
  writeFileSync(
    join(directory, 'consumer.mts'),
    `
    import { createClient } from ${specifier};
    type Event = { kind: 'created'; actor: { id: string; roles: string[] } } | { kind: 'updated'; changes: Record<string, { before: unknown; after: unknown }> };
    type Entity = { kind: 'entity'; id: string; owner: { id: string; profile: { name: string; tags: string[] } }; events: Event[] };
    type Pending = { kind: 'pending'; job: { id: string; retryAfter: number } };
    type Paths = { ${entries} };
    const api = createClient<Paths>({baseUrl:'https://example.test'});
    ${uses}
    // @ts-expect-error required query must survive shared prefixes
    api.orgs('org').resources.r0('id').get();
    // @ts-expect-error nested path parameters remain strings
    api.orgs(1);
    // @ts-expect-error the accepted response is a union
    const invalid: Promise<Entity> = api.orgs('org').resources.r0('id').get({query:{expand:'owner'}});
  `,
  );
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        module: 'NodeNext',
        target: 'ES2022',
        incremental: true,
        tsBuildInfoFile: './project.tsbuildinfo',
      },
      files: ['consumer.mts'],
    }),
  );
  for (const phase of ['cold', 'unchanged', 'edited']) {
    if (phase === 'edited')
      appendFileSync(
        join(directory, 'consumer.mts'),
        `\nconst edited: Promise<Entity | Pending> = api.orgs('edited').resources.r999('last').get({query:{expand:'events'}}); void edited;\n`,
      );
    const result = spawn.sync(
      process.execPath,
      [
        join(root, 'node_modules/typescript/bin/tsc'),
        '-p',
        'tsconfig.json',
        '--extendedDiagnostics',
      ],
      { cwd: directory, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const instantiations = Number(/Instantiations:\s+(\d+)/.exec(result.stdout)?.[1]);
    const memoryKB = Number(/Memory used:\s+(\d+)K/.exec(result.stdout)?.[1]);
    assert.ok(
      Number.isFinite(instantiations) && instantiations < 3_000_000,
      `Type complexity budget exceeded: ${instantiations}`,
    );
    assert.ok(memoryKB > 0 && memoryKB < 1_200_000, `Type memory budget exceeded: ${memoryKB}`);
    if (phase !== 'unchanged') assert.ok(instantiations > 0, 'Changed consumers must be checked');
    console.log(
      JSON.stringify({
        scenario: 'shared-prefix-response-unions',
        routes,
        usedOperations: usedOperations + Number(phase === 'edited'),
        phase,
        instantiations,
        memoryKB,
        checkTime: /Check time:\s+(\S+)/.exec(result.stdout)?.[1] ?? 'cached',
        totalTime: /Total time:\s+(\S+)/.exec(result.stdout)?.[1],
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
