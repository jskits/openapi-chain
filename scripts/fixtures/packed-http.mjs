import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createClient } from 'openapi-chain';
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';

// Copied into the isolated npm consumer by check-package.mjs; imports resolve
// only against its installed tarball, never the repository's source tree.
const document = JSON.parse(
  readFileSync(new URL('./conformance.openapi.json', import.meta.url), 'utf8'),
);
const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        url: request.url,
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: request.headers['content-type'] ?? '',
      }),
    );
  });
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const metadata = compileOpenAPIMetadata(document);
  for (const api of [createClient({ baseUrl }), createStrictClient({ baseUrl, metadata })]) {
    assert.equal((await api.echo('a/b').get()).url, '/echo/a%2Fb');
    assert.equal((await api.$path('/echo/{id}/', { id: 'a/b' }).get()).url, '/echo/a%2Fb/');
  }
  const strict = createStrictClient({ baseUrl, metadata });
  assert.equal(
    (await strict.search.get({ query: { color: ['blue', 'black', 'brown'] } })).url,
    '/search?color=blue,black,brown',
  );
  const uploaded = await strict.upload.post({ body: { value: 'hello' } });
  assert.ok(!uploaded.body.includes('filename='));
  const form = await new Response(uploaded.body, {
    headers: { 'content-type': uploaded.contentType },
  }).formData();
  assert.equal(form.get('value'), 'hello');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
