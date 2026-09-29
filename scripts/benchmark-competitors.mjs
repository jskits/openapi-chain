// Compare openapi-chain with other Fetch/HTTP clients under one reproducible method.
//   node scripts/benchmark-competitors.mjs                 all runtime suites (mock, http)
//   node scripts/benchmark-competitors.mjs --suite=mock    openapi-fetch's upstream harness shape
//   node scripts/benchmark-competitors.mjs --suite=http    real loopback HTTP with keep-alive
//   node scripts/benchmark-competitors.mjs --suite=types --compiler=ts6|ts7
// Timing results are informational and never gate CI.
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const option = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const suite = option('suite');
const rounds = Number(option('rounds', 3));
const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const BASE_URL = 'https://api.test.local';
const OPERATION = { get: { responses: { 200: { description: 'ok' } } } };

if (process.argv.includes('--serve')) serve();
else if (!suite) {
  // Separate processes keep each suite's global fetch and JIT state independent.
  for (const name of ['mock', 'http']) {
    const result = spawnSync(process.execPath, [script, `--suite=${name}`, `--rounds=${rounds}`], {
      stdio: 'inherit',
    });
    assert.equal(result.status, 0, `${name} suite failed`);
  }
} else if (suite === 'mock') await mockSuite();
else if (suite === 'http') await httpSuite();
else if (suite === 'types') await typesSuite();
else throw new TypeError('Use --suite=mock, --suite=http or --suite=types.');

function serve() {
  let hits = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/hits') return response.end(String(hits));
    hits++;
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': 2 });
    response.end('{}');
  });
  server.keepAliveTimeout = 60_000;
  server.listen(0, '127.0.0.1', () => process.send(server.address().port));
}

async function clients(baseUrl, headers) {
  const [
    { createClient },
    { createStrictClient },
    { compileOpenAPIMetadata },
    { default: createFetchClient, createPathBasedClient },
    { Fetcher },
    { createApiFetchClient },
    { default: axios },
  ] = await Promise.all([
    import('../packages/core/dist/index.js'),
    import('../packages/core/dist/strict.js'),
    import('../packages/core/dist/metadata.js'),
    import('openapi-fetch'),
    import('openapi-typescript-fetch'),
    import('feature-fetch'),
    import('axios'),
  ]);
  const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/url': OPERATION } });
  const fetcher = Fetcher.for();
  fetcher.configure({ baseUrl, init: { headers } });
  return {
    factories: { createClient, createStrictClient, createFetchClient, createPathBasedClient },
    factoryArgs: { Fetcher, createApiFetchClient, axios, metadata },
    chain: createClient({ baseUrl, headers }),
    strict: createStrictClient({ baseUrl, headers, metadata }),
    openapiFetch: createFetchClient({ baseUrl, headers }),
    openapiFetchPath: createPathBasedClient({ baseUrl, headers }),
    openapiTSFetch: fetcher.path('/url').method('get').create(),
    featureFetch: createApiFetchClient({ baseUrl, headers }),
    axiosFetch: axios.create({ baseURL: baseUrl, headers, adapter: 'fetch' }),
  };
}

/** Per-request headers in each library's own input shape. */
function requestCases(c, extra) {
  const init = extra && { headers: extra };
  return {
    'openapi-chain core': () => c.chain.url.get(init && { init }),
    'openapi-chain core $path': () => c.chain.$path('/url').get(init && { init }),
    'openapi-chain strict': () => c.strict.url.get(init && { init }),
    'openapi-fetch': () => c.openapiFetch.GET('/url', init),
    'openapi-fetch path-based': () => c.openapiFetchPath['/url'].GET(init),
    'openapi-typescript-fetch': () => c.openapiTSFetch(null, init),
    'feature-fetch': () => c.featureFetch.get('/url', init),
    'axios fetch adapter': () => c.axiosFetch.get('/url', init),
  };
}

/** Reject failures that a library reports as values instead of rejected promises. */
function assertSuccess(label, result) {
  if (Array.isArray(result)) assert.equal(result[0], true, `${label} returned an error tuple`);
  else if (result && 'error' in result && 'response' in result)
    assert.equal(result.error, undefined, `${label} returned an error`);
}

async function measure(cases, verify) {
  for (const [label, run] of Object.entries(cases)) await verify(label, run);
  const samples = Object.fromEntries(Object.keys(cases).map((label) => [label, []]));
  for (let round = 0; round < rounds; round++) {
    const order = Object.entries(cases).sort(() => Math.random() - 0.5);
    for (const [label, run] of order) {
      for (let end = performance.now() + 200; performance.now() < end;) await run();
      let count = 0;
      const start = performance.now();
      for (let end = start + 1000; performance.now() < end; count++) await run();
      samples[label].push(count / ((performance.now() - start) / 1000));
    }
  }
  const medians = Object.entries(samples).map(([label, values]) => [
    label,
    values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)],
  ]);
  const best = Math.max(...medians.map(([, value]) => value));
  return medians
    .toSorted((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      opsPerSecond: Math.round(value),
      relative: +(best / value).toFixed(2),
    }));
}

function report(scenario, rows) {
  console.log(JSON.stringify({ suite, scenario, rounds, node: process.version, rows }));
}

async function mockSuite() {
  // Mirrors openapi-fetch's test/bench harness: a nextTick-resolved empty JSON response.
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise((resolve) =>
      process.nextTick(() => resolve(Response.json({}, { status: 200 }))),
    );
  };
  const verify = async (label, run) => {
    const before = calls;
    assertSuccess(label, await run());
    assert.equal(calls - before, 1, `${label} must reach the Fetch mock once`);
  };
  const plain = await clients(BASE_URL);
  const { factories: f, factoryArgs: a } = plain;
  const setup = {
    'openapi-chain core': () => f.createClient({ baseUrl: BASE_URL }),
    'openapi-chain strict': () => f.createStrictClient({ baseUrl: BASE_URL, metadata: a.metadata }),
    'openapi-fetch': () => f.createFetchClient({ baseUrl: BASE_URL }),
    'openapi-fetch path-based': () => f.createPathBasedClient({ baseUrl: BASE_URL }),
    'openapi-typescript-fetch': () => {
      const fetcher = a.Fetcher.for();
      fetcher.configure({ baseUrl: BASE_URL });
      return fetcher.path('/url').method('get').create();
    },
    'feature-fetch': () => a.createApiFetchClient({ baseUrl: BASE_URL }),
    axios: () => a.axios.create({ baseURL: BASE_URL }),
  };
  report('setup', await measure(setup, async () => {}));
  report('get (only URL)', await measure(requestCases(plain), verify));
  const withHeaders = await clients(BASE_URL, { 'x-base-header': '123' });
  report(
    'get (headers)',
    await measure(requestCases(withHeaders, { 'x-header-1': '123', 'x-header-2': '456' }), verify),
  );
}

async function httpSuite() {
  const server = fork(script, ['--serve']);
  try {
    const port = await new Promise((resolve) => server.once('message', resolve));
    const baseUrl = `http://127.0.0.1:${port}`;
    const hits = async () => Number(await (await fetch(`${baseUrl}/hits`)).text());
    const verify = async (label, run) => {
      const before = await hits();
      assertSuccess(label, await run());
      assert.equal((await hits()) - before, 1, `${label} must reach the server once`);
    };
    const { default: superagent } = await import('superagent');
    const agent = new http.Agent({ keepAlive: true });
    const c = await clients(baseUrl);
    const axiosHttp = c.factoryArgs.axios.create({ baseURL: baseUrl, httpAgent: agent });
    const superagentClient = superagent.agent().use((request) => request.agent(agent));
    const cases = {
      'fetch + response.json() baseline': async () => (await fetch(`${baseUrl}/url`)).json(),
      ...requestCases(c),
      'axios http adapter': () => axiosHttp.get('/url'),
      superagent: () => superagentClient.get(`${baseUrl}/url`),
    };
    report('get (loopback HTTP)', await measure(cases, verify));
    agent.destroy();
  } finally {
    server.kill();
  }
}

async function typesSuite() {
  const { compiler, compilerInfo } = await import('./lib/compiler.mjs');
  console.log(JSON.stringify(compilerInfo()));
  const specifiers = {
    chain: join(root, 'packages/core/dist/index.js'),
    fetch: fileURLToPath(import.meta.resolve('openapi-fetch')),
  };
  const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-competitor-types-'));
  try {
    for (const count of [100, 1000, 5000]) {
      // openapi-typescript's output shape, including explicit `never` locations and methods.
      const entries = Array.from(
        { length: count },
        (_, i) => `'/r${i}/{id}': {
  parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
  get: {
    parameters: { query: { q: string }; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: { 200: { headers: { [name: string]: unknown }; content: { 'application/json': { ok: true } } } };
  };
  put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
};`,
      ).join('\n');
      const used = Array.from({ length: 25 }, (_, i) => Math.floor((i * count) / 25));
      const consumers = {
        'openapi-chain': `import { createClient } from ${JSON.stringify(specifiers.chain)};
type Paths = {${entries}};
const api = createClient<Paths>({ baseUrl: 'https://example.test' });
${used.map((n, i) => `const r${i}: Promise<{ ok: true }> = api.r${n}('id').get({ query: { q: 'x' } }); void r${i};`).join('\n')}
// @ts-expect-error required query
api.r0('id').get();
// @ts-expect-error path type
api.r0(1);
`,
        'openapi-fetch': `import createClient from ${JSON.stringify(specifiers.fetch)};
type Paths = {${entries}};
const api = createClient<Paths>({ baseUrl: 'https://example.test' });
${used.map((n, i) => `const r${i}: Promise<{ ok: true } | undefined> = api.GET('/r${n}/{id}', { params: { path: { id: 'id' }, query: { q: 'x' } } }).then((result) => result.data); void r${i};`).join('\n')}
// @ts-expect-error required query
api.GET('/r0/{id}', { params: { path: { id: 'id' } } });
// @ts-expect-error path type
api.GET('/r0/{id}', { params: { path: { id: 1 }, query: { q: 'x' } } });
`,
      };
      for (const [label, source] of Object.entries(consumers)) {
        writeFileSync(join(directory, 'consumer.mts'), source);
        const runs = Array.from({ length: 3 }, () => {
          const result = spawnSync(
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
              '--lib',
              'ES2022,DOM',
              '--extendedDiagnostics',
              'consumer.mts',
            ],
            { cwd: directory, encoding: 'utf8' },
          );
          assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`);
          return {
            instantiations: Number(/Instantiations:\s+(\d+)/.exec(result.stdout)?.[1]),
            memoryKB: Number(/Memory used:\s+(\d+)K/.exec(result.stdout)?.[1]),
            checkSeconds: Number.parseFloat(/Check time:\s+(\S+)/.exec(result.stdout)?.[1]),
          };
        }).toSorted((a, b) => a.checkSeconds - b.checkSeconds);
        console.log(
          JSON.stringify({ suite, client: label, routes: count, usedOperations: 25, ...runs[1] }),
        );
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
