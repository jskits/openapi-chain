import { createServer } from 'node:http';
import { once } from 'node:events';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { createClient } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import document from './fixtures/conformance.openapi.json' with { type: 'json' };
import type { paths } from './fixtures/conformance-schema.js';

// The server observes bytes independently of client serialization and metadata.
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
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
let baseUrl: string;
beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

// Expected literals come from the documented wire contract, not another serializer.
test.each(['3.0.4', '3.1.1', '3.2.1'])(
  'generated types and real HTTP preserve equivalent paths in %s',
  async (openapi) => {
    const metadata = compileOpenAPIMetadata({ ...document, openapi });
    for (const api of [
      createClient<paths>({ baseUrl }),
      createStrictClient<paths>({ baseUrl, metadata }),
    ]) {
      expect((await api.$path('/reports/{year}-{month}', { year: 2026, month: 9 }).get()).url).toBe(
        '/reports/2026-9',
      );
      const chain = await api.$path('/echo/{id}', { id: 'a/b' }).get();
      const template = await api.$path('/echo/{id}', { id: 'a/b' }).get();
      const trailing = await api.$path('/echo/{id}/', { id: 'a/b' }).get();
      expect(chain).toEqual({ url: '/echo/a%2Fb', body: '', contentType: '' });
      expect(template).toEqual(chain);
      expect(trailing).toEqual({ ...chain, url: '/echo/a%2Fb/' });
    }
  },
);

test('strict form query matches the OAS style example over HTTP', async () => {
  const api = createStrictClient<paths>({ baseUrl, metadata: compileOpenAPIMetadata(document) });
  const result = await api.search.get({ query: { color: ['blue', 'black', 'brown'] } });
  expect(result.url).toBe('/search?color=blue,black,brown');
});

test('constraint-only composition leaves multipart text unchanged over HTTP', async () => {
  const api = createStrictClient<paths>({ baseUrl, metadata: compileOpenAPIMetadata(document) });
  const result = await api.upload.post({ body: { value: 'hello' } });
  expect(result.url).toBe('/upload');
  expect(result.contentType).toMatch(/^multipart\/form-data; boundary=/);
  expect(result.body).not.toContain('filename=');
  expect(result.body).toContain('name="value"\r\n\r\nhello\r\n');
  const form = await new Response(result.body, {
    headers: { 'content-type': result.contentType },
  }).formData();
  expect(form.get('value')).toBe('hello');
});
