import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import spawn from 'cross-spawn';
import { compileOpenAPIMetadata } from '../packages/core/dist/metadata.js';
import { typeFixture } from './lib/type-fixture.mjs';
import { compiler, compilerInfo } from './lib/compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
console.log(JSON.stringify(compilerInfo()));
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-scope-types-'));
try {
  let fullInstantiations;
  for (const [mode, routes, selected, calls] of [
    ['core', 1000, 1000, 1],
    ['core', 1000, 1000, 5],
    ['core', 1000, 1000, 25],
    ['core', 1000, 1000, 100],
    ['core', 5000, 5000, 25],
    ['core', 5000, 250, 25],
    ['strict', 5000, 5000, 25],
    ['strict', 5000, 250, 25],
  ]) {
    writeFileSync(
      join(directory, 'consumer.mts'),
      typeFixture(root, routes, selected, calls, mode),
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
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const instantiations = Number(/Instantiations:\s+(\d+)/.exec(result.stdout)?.[1]);
    assert.ok(instantiations > 0 && instantiations < compiler.budget.instantiations);
    const memoryKB = Number(/Memory used:\s+(\d+)K/.exec(result.stdout)?.[1]);
    assert.ok(memoryKB > 0 && memoryKB < compiler.budget.memoryKB);
    if (routes === 5000 && selected === routes) fullInstantiations = instantiations;
    if (selected < routes)
      assert.ok(
        instantiations < fullInstantiations,
        'Scoping must reduce instantiation work for identical calls.',
      );
    console.log(
      JSON.stringify({
        mode,
        routes,
        selected,
        calls,
        instantiations,
        memory: /Memory used:\s+(\S+)/.exec(result.stdout)?.[1],
        checkTime: /Check time:\s+(\S+)/.exec(result.stdout)?.[1],
      }),
    );
  }
  const document = {
    openapi: '3.1.0',
    paths: Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [
        `/r${i}/{id}`,
        {
          get: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              {
                name: 'filter',
                in: 'query',
                style: 'deepObject',
                explode: true,
                schema: { type: 'object', properties: { name: { type: 'string' } } },
              },
            ],
            responses: {
              200: {
                description: 'Synthetic operation for measuring delivery; not a public API corpus.',
              },
            },
          },
        },
      ]),
    ),
  };
  const gzip = (value) => gzipSync(JSON.stringify(value), { level: 9 }).length;
  for (const selected of [1000, 250, 50]) {
    const metadata = compileOpenAPIMetadata(document, {
      paths: Object.keys(document.paths).slice(0, selected),
    });
    assert.equal(Object.keys(metadata.operations).length, selected);
    console.log(
      JSON.stringify({
        scenario: 'synthetic-metadata-delivery',
        routes: 1000,
        selected,
        documentGzip: gzip(document),
        metadataGzip: gzip(metadata),
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
