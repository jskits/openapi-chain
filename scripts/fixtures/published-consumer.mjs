import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createClient } from 'openapi-chain';
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import { createQuery } from '@openapi-chain/query';

// This fixture is copied outside the repository, so every import resolves
// through the three freshly installed registry packages.
const require = createRequire(import.meta.url);
const cjsCore = require('openapi-chain');
const cjsStrict = require('openapi-chain/strict');
const cjsMetadata = require('openapi-chain/metadata');
const cjsQuery = require('@openapi-chain/query');
for (const [entry, value] of [
  ['openapi-chain', cjsCore.createClient],
  ['openapi-chain/strict', cjsStrict.createStrictClient],
  ['openapi-chain/metadata', cjsMetadata.compileOpenAPIMetadata],
  ['@openapi-chain/query', cjsQuery.createQuery],
])
  assert.equal(typeof value, 'function', `CommonJS ${entry} entry is missing`);

const document = JSON.parse(readFileSync(new URL('./openapi.json', import.meta.url), 'utf8'));
let requests = 0;
const server = createServer((request, response) => {
  requests++;
  assert.equal(request.method, 'GET');
  assert.equal(request.url, '/items/book');
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ id: 'book' }));
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const clients = [
    createClient({ baseUrl }),
    createStrictClient({ baseUrl, metadata: compileOpenAPIMetadata(document) }),
    cjsCore.createClient({ baseUrl }),
    cjsStrict.createStrictClient({
      baseUrl,
      metadata: cjsMetadata.compileOpenAPIMetadata(document),
    }),
  ];
  for (const client of clients) assert.deepEqual(await client.items('book').get(), { id: 'book' });

  const query = createQuery({
    key: ['published-smoke', 'GET', '/items/{id}'],
    fetcher: ({ id }, { signal }) => clients[1].items(id).get({ init: signal ? { signal } : {} }),
  });
  const input = { id: 'book' };
  const options = query.queryOptions(input);
  input.id = 'changed';
  assert.equal(Object.isFrozen(options.queryKey.at(-1)), true);
  assert.deepEqual(await options.queryFn({ signal: new AbortController().signal }), { id: 'book' });
  const swr = query.swr({ id: 'book' });
  assert.deepEqual(await swr.fetcher(swr.key), { id: 'book' });

  const cjsOperation = cjsQuery.createQuery({
    key: ['published-smoke-cjs', 'GET', '/items/{id}'],
    fetcher: ({ id }) => clients[2].items(id).get(),
  });
  assert.deepEqual(
    await cjsOperation.queryOptions({ id: 'book' }).queryFn({
      signal: new AbortController().signal,
    }),
    { id: 'book' },
  );
  assert.equal(requests, 7);
  console.log('Published ESM/CommonJS core, strict, metadata and Query passed local HTTP.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
