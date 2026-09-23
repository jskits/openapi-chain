import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createQuery } from 'openapi-chain-query';
import { createClient, HttpError } from 'openapi-chain';
import { QueryClient } from '@tanstack/react-query';

assert.equal(typeof createRequire(import.meta.url)('openapi-chain-query').createQuery, 'function');
let requests = 0;
const server = createServer((request, response) => {
  requests++;
  response.setHeader('content-type', 'application/json');
  response.statusCode = request.url === '/items/missing' ? 404 : 200;
  response.end(JSON.stringify({ url: request.url }));
});
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const api = createClient({ baseUrl: `http://127.0.0.1:${address.port}` });
  const item = createQuery({
    key: ['account-a', 'GET', '/items/{id}'],
    fetcher: (input, { signal }) => api.items(input.id).get({ init: { signal } }),
  });
  const input = { id: 'a/b' };
  const options = item.queryOptions(input);
  input.id = 'changed';
  assert.deepEqual(await client.fetchQuery(options), { url: '/items/a%2Fb' });
  await client.fetchQuery(item.queryOptions({ id: 'a/b' }));
  assert.equal(requests, 1);
  await assert.rejects(client.fetchQuery(item.queryOptions({ id: 'missing' })), HttpError);
  const swr = item.swr({ id: 'swr' });
  assert.deepEqual(await swr.fetcher(swr.key), { url: '/items/swr' });
  assert.equal(item.swr(null).key, null);
} finally {
  client.clear();
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
