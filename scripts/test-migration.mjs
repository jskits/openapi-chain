import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareMigration } from './compare-migration.mjs';

// The tool's built-in transport must never fall back to a real request.
globalThis.fetch = () => {
  throw new Error('Unexpected network access');
};
const json = () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
const document = {
  openapi: '3.1.0',
  paths: {
    '/plain': { get: {} },
    '/filter': {
      get: {
        parameters: [
          {
            name: 'filter',
            in: 'query',
            style: 'deepObject',
            explode: true,
            schema: { type: 'object' },
          },
        ],
      },
    },
    '/required': {
      get: { parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] },
    },
    '/form': {
      post: { requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } } },
    },
  },
};
const run = (scenario, extra = {}) =>
  compareMigration({
    document,
    scenarios: [{ name: 'case', path: '/plain', response: json, ...scenario }],
    ...extra,
  });
const same = await run({});
assert.equal(same.passed, true);
const different = await run({
  path: '/filter',
  input: () => ({ query: { filter: { color: 'red' } } }),
});
assert.deepEqual(different.scenarios[0].differences, ['request']);
assert.equal(
  different.scenarios[0].core.requests[0].url,
  'https://migration.invalid/filter?color=red',
);
assert.equal(
  different.scenarios[0].strict.requests[0].url,
  'https://migration.invalid/filter?filter%5Bcolor%5D=red',
);
const binary = await run({ response: () => new Response(new Uint8Array([0, 255])) });
assert.deepEqual(binary.scenarios[0].differences, ['response']);
assert.deepEqual(binary.scenarios[0].strict.result, {
  kind: 'bytes',
  type: 'ArrayBuffer',
  bytes: [0, 255],
});
const required = await run({ path: '/required' });
assert.equal(required.passed, false);
assert.equal(required.scenarios[0].strict.requests.length, 0);
assert.match(required.scenarios[0].strict.error.message, /Missing required/);
const invalid = await run(
  {},
  { document: { openapi: '3.1.0', paths: { '/plain': { $ref: 'external.json' } } } },
);
assert.match(invalid.metadataError.message, /External/);
assert.equal(invalid.passed, false);
// Equal errors must never count as successful migration.
const failure = await run({ response: () => new Response('bad', { status: 400 }) });
assert.equal(failure.passed, false);
assert.equal(failure.scenarios[0].core.error.status, 400);
const returnedError = await run(
  {
    response: () =>
      new Response('{"error":"bad"}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  },
  { throwOnError: false },
);
assert.equal(returnedError.passed, true);
assert.equal(returnedError.scenarios[0].strict.result.value.ok, false);
const emptyExtension = await run({
  input: () => ({ query: {}, extensions: { query: () => '?fixed=1' } }),
});
assert.equal(emptyExtension.passed, true);
const multipart = await run({
  path: '/form',
  method: 'post',
  input: () => {
    const body = new FormData();
    body.append('a', 'b');
    body.append('file', new File([new Uint8Array([1, 2])], 'a.bin'));
    return { body, contentType: 'multipart/form-data' };
  },
});
assert.equal(multipart.passed, true);
assert.equal(multipart.scenarios[0].strict.requests[0].body.kind, 'form');
const adapted = await run({
  response: () => new Response(new Uint8Array([65])),
  strictInput: () => ({
    extensions: {
      response: async (response) => ({ status: response.status, data: await response.text() }),
    },
  }),
});
assert.equal(adapted.passed, true);
assert.equal(adapted.scenarios[0].adaptedInput, true);
await assert.rejects(compareMigration({ document, scenarios: [] }), /at least one/);
await assert.rejects(run({ input: {} }), /factory/);
await assert.rejects(run({ method: 'then' }), /supported methods/);
const cli = spawnSync(
  process.execPath,
  ['scripts/compare-migration.mjs', 'examples/migration.config.mjs'],
  { encoding: 'utf8' },
);
assert.equal(cli.status, 0, cli.stderr);
assert.equal(JSON.parse(cli.stdout).passed, true);
const missing = spawnSync(process.execPath, ['scripts/compare-migration.mjs'], {
  encoding: 'utf8',
});
assert.equal(missing.status, 1);
assert.equal(JSON.parse(missing.stderr).passed, false);
const temp = mkdtempSync(join(tmpdir(), 'openapi-chain-migration-'));
try {
  const file = join(temp, 'difference.mjs');
  writeFileSync(
    file,
    `export default { document: ${JSON.stringify(document)}, scenarios: [{name:'binary',path:'/plain',response:()=>new Response(new Uint8Array([255]))}] };`,
  );
  const mismatch = spawnSync(process.execPath, ['scripts/compare-migration.mjs', file], {
    encoding: 'utf8',
  });
  assert.equal(mismatch.status, 1);
  assert.deepEqual(JSON.parse(mismatch.stdout).scenarios[0].differences, ['response']);
  writeFileSync(
    file,
    `export default { document: ${JSON.stringify(document)}, scenarios: [{name:'opaque',path:'/plain',response:()=>new Response('fixture'),input:()=>({extensions:{response:r=>({status:r.status,data:new Response('before')})}}),strictInput:()=>({extensions:{response:r=>({status:r.status,data:new Response('after')})}})}] };`,
  );
  const opaque = spawnSync(process.execPath, ['scripts/compare-migration.mjs', file], {
    encoding: 'utf8',
  });
  assert.equal(opaque.status, 1);
  const opaqueReport = JSON.parse(opaque.stdout);
  assert.equal(opaqueReport.passed, false);
  assert.match(
    opaqueReport.scenarios[0].strict.error.message,
    /Response.*data.*cannot be compared/,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const unsupported = await run({
  input: () => ({
    extensions: { response: (response) => ({ status: response.status, data: new Map() }) },
  }),
});
assert.equal(unsupported.passed, false);
assert.match(unsupported.scenarios[0].strict.error.message, /snapshots require/);

const changedBinaryType = await run({
  input: () => ({
    extensions: { response: (response) => ({ status: response.status, data: new ArrayBuffer(1) }) },
  }),
  strictInput: () => ({
    extensions: { response: (response) => ({ status: response.status, data: new Uint8Array(1) }) },
  }),
});
assert.deepEqual(changedBinaryType.scenarios[0].differences, ['response']);

// Response bodies must not disappear from application-data comparisons.
for (const throwOnError of [true, false]) {
  for (const wrap of [
    (value) => value,
    (value) => ({ nested: [value] }),
    (value) => ({ ok: true, status: 200, data: 'value', response: value }),
  ]) {
    const responseData = await run(
      {
        input: () => ({
          extensions: {
            response: (response) => ({
              status: response.status,
              data: wrap(new Response('before')),
            }),
          },
        }),
        strictInput: () => ({
          extensions: {
            response: (response) => ({
              status: response.status,
              data: wrap(new Response('after')),
            }),
          },
        }),
      },
      { throwOnError },
    );
    assert.equal(responseData.passed, false);
    for (const mode of ['core', 'strict']) {
      assert.match(
        responseData.scenarios[0][mode].error.message,
        /Response.*data.*cannot be compared/,
      );
    }
  }
}
for (const status of [200, 404]) {
  const streamData = await run({
    response: () => new Response('stream', { status }),
    input: () => ({
      extensions: { response: (response) => ({ status: response.status, data: response.body }) },
    }),
  });
  assert.equal(streamData.passed, false);
  const issue = streamData.scenarios[0].strict.error;
  assert.match((issue.dataError ?? issue).message, /snapshots require/);
}
// Unsupported data inside HttpError must remain a report, not reject the whole run.
const opaqueError = await run({
  response: () => new Response('error', { status: 404 }),
  input: () => ({
    extensions: {
      response: (response) => ({ status: response.status, data: new Response('hidden') }),
    },
  }),
});
assert.equal(opaqueError.passed, false);
assert.equal(opaqueError.scenarios[0].strict.error.status, 404);
assert.match(
  opaqueError.scenarios[0].strict.error.dataError.message,
  /Response.*data.*cannot be compared/,
);
for (const status of [200, 204, 404]) {
  const envelope = await run(
    {
      response: () =>
        status === 204
          ? new Response(null, { status })
          : new Response('{"ok":true}', {
              status,
              headers: { 'content-type': 'application/json' },
            }),
    },
    { throwOnError: false },
  );
  assert.equal(envelope.passed, true);
  assert.equal(envelope.scenarios[0].strict.result.value.response.status, status);
}
console.log(
  'Migration comparison checks passed, including opaque Response data, nested values, streams, HTTP errors and normal result envelopes.',
);
