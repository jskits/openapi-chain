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
    if (request.url === '/misleading-text') {
      response.setHeader('content-type', 'text/plain; note="application/json"');
      response.end('hello');
      return;
    }
    if (request.url === '/misleading-binary') {
      response.setHeader('content-type', 'application/octet-stream; note="xml"');
      response.end(Buffer.from([255, 0, 65]));
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        url: request.url,
        body: Buffer.concat(chunks).toString('utf8'),
        bytes: Buffer.concat(chunks).toJSON().data,
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
    assert.equal((await api.$path('/echo/{id}', { id: 'a/b' }).get()).url, '/echo/a%2Fb');
    assert.equal((await api.$path('/echo/{id}/', { id: 'a/b' }).get()).url, '/echo/a%2Fb/');
  }
  const slashClient = createStrictClient({
    baseUrl,
    metadata: compileOpenAPIMetadata({
      openapi: '3.1.1',
      paths: {
        '/tail/{id}/': {
          get: {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          },
        },
      },
    }),
  });
  assert.equal((await slashClient.tail('a/b').get()).url, '/tail/a%2Fb/');
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
  const binaryDocument = {
    openapi: '3.1.1',
    paths: {
      '/parts': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { properties: { file: {}, text: { type: 'string' }, raw: {} } },
                encoding: {
                  file: { contentType: 'application/octet-stream' },
                  text: { contentType: 'text/plain; charset=utf-8' },
                  raw: { contentType: 'text/plain; charset=iso-8859-1' },
                },
              },
            },
          },
        },
      },
    },
  };
  const upload = createStrictClient({ baseUrl, metadata: compileOpenAPIMetadata(binaryDocument) });
  const received = await upload.parts.post({
    body: {
      file: [new File(['A'], 'one.csv', { type: 'text/csv' }), new File(['B'], 'two.csv')],
      text: 'café😀',
      raw: new Uint8Array([99, 0xe9, 98]).subarray(1, 2),
    },
  });
  const bytes = Buffer.from(received.bytes);
  assert.ok(bytes.includes(Buffer.from('Content-Type: text/plain; charset=utf-8')));
  assert.ok(bytes.includes(Buffer.from('café😀')));
  assert.ok(bytes.includes(Buffer.from([13, 10, 13, 10, 0xe9, 13, 10])));
  const parsed = await new Response(new Uint8Array(received.bytes), {
    headers: { 'content-type': received.contentType },
  }).formData();
  assert.deepEqual(
    parsed.getAll('file').map((file) => [file.name, file.type]),
    [
      ['one.csv', 'application/octet-stream'],
      ['two.csv', 'application/octet-stream'],
    ],
  );
  for (const body of [
    new Uint8Array([99, 65, 66, 98]).subarray(1, 3),
    new DataView(new Uint8Array([99, 65, 66, 98]).buffer, 1, 2),
  ]) {
    const echoed = await createClient({ baseUrl }).binary.post({
      contentType: 'application/octet-stream',
      body,
    });
    assert.deepEqual(echoed.bytes, [65, 66]);
  }
  const mediaMetadata = compileOpenAPIMetadata({
    openapi: '3.1.1',
    paths: {
      '/misleading-text': { get: {} },
      '/misleading-binary': { get: {} },
      '/text': { post: { requestBody: { content: { 'text/plain': {} } } } },
    },
  });
  for (const api of [
    createClient({ baseUrl }),
    createStrictClient({ baseUrl, metadata: mediaMetadata }),
  ]) {
    assert.equal(await api.$path('/misleading-text').get(), 'hello');
    const echoed = await api.text.post({ body: 'café', contentType: 'text/plain; charset=utf-8' });
    assert.deepEqual(echoed.bytes, [99, 97, 102, 195, 169]);
    await assert.rejects(
      api.text.post({ body: 'café', contentType: 'text/plain; charset=iso-8859-1' }),
      /charset/,
    );
    const encoded = await api.text.post({
      body: new Uint8Array([99, 97, 102, 233]),
      contentType: 'text/plain; charset=iso-8859-1',
    });
    assert.deepEqual(encoded.bytes, [99, 97, 102, 233]);
  }
  assert.deepEqual(
    [
      ...new Uint8Array(
        await createStrictClient({ baseUrl, metadata: mediaMetadata })
          .$path('/misleading-binary')
          .get(),
      ),
    ],
    [255, 0, 65],
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
