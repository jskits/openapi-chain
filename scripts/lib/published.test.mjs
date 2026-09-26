import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicationProblem,
  readRegistryVersion,
  RegistryContractError,
  waitForPublished,
} from './published.mjs';

const expected = { name: '@openapi-chain/cli', version: '0.5.2' };
const record = {
  ...expected,
  dist: {
    integrity: 'sha512-example',
    attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } },
  },
};

void test('requires the exact package identity, integrity and provenance', () => {
  assert.equal(publicationProblem(record, expected), null);
  assert.equal(publicationProblem({ ...record, dist: {} }, expected), 'dist.integrity is missing');
  assert.equal(
    publicationProblem({ ...record, dist: { integrity: 'sha512-example' } }, expected),
    'dist.attestations.provenance is missing',
  );
  assert.throws(
    () => publicationProblem({ ...record, version: '0.5.1' }, expected),
    RegistryContractError,
  );
});

void test('uses the fixed public registry and treats incomplete metadata as pending', async () => {
  const observed = [];
  const read = (body, status = 200) =>
    readRegistryVersion(expected, async (url) => {
      observed.push(url.href);
      return new Response(JSON.stringify(body), { status });
    });
  assert.deepEqual(await read({}, 404), { problem: 'registry returned HTTP 404' });
  assert.deepEqual(await read({ ...record, dist: {} }), {
    problem: 'dist.integrity is missing',
  });
  assert.deepEqual(await read(record), { record });
  for (const url of observed)
    assert.match(url, /^https:\/\/registry\.npmjs\.org\/%40openapi-chain%2Fcli\/0\.5\.2\?/);
});

void test('fails after a finite wait with the last package diagnostic', async () => {
  let time = 0;
  const logs = [];
  await assert.rejects(
    waitForPublished([expected], {
      read: async () => ({ problem: 'registry returned HTTP 404' }),
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      timeoutMs: 25,
      pollMs: 10,
      log: (message) => logs.push(message),
    }),
    /timed out after 25 ms: @openapi-chain\/cli@0\.5\.2: registry returned HTTP 404/,
  );
  assert.equal(time, 25);
  assert.equal(logs.length, 1);
});

void test('accepts an exact version once metadata becomes complete', async () => {
  let calls = 0;
  let time = 0;
  const result = await waitForPublished([expected], {
    read: async () =>
      ++calls < 3 ? { problem: 'dist.attestations.provenance is missing' } : { record },
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    timeoutMs: 100,
    pollMs: 10,
    log: () => {},
  });
  assert.deepEqual(result, [record]);
  assert.equal(calls, 3);
});
