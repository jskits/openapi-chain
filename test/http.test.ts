import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Echo = { url: string; body: string; contentType: string };
type Paths = {
  '/echo/{id}': {
    parameters: { path: { id: string } };
    post: {
      parameters: { query?: { q?: string } };
      requestBody: { content: { 'application/json': { name: string } } };
      responses: { 200: { content: { 'application/json': Echo } } };
    };
  };
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': FormData } };
      responses: { 200: { content: { 'application/json': { name: string } } } };
    };
  };
  '/slow': { get: { responses: { 200: { content: { 'application/json': object } } } } };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.2.1',
  paths: {
    '/echo/{id}': {
      post: {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': {} } },
      },
    },
    '/upload': { post: { requestBody: { content: { 'multipart/form-data': {} } } } },
    '/slow': { get: {} },
  },
});
async function handle(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/slow') {
    const timer = setTimeout(() => response.end('{}'), 1000);
    response.on('close', () => clearTimeout(timer));
    return;
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk as Uint8Array);
  const bytes = new Uint8Array(Buffer.concat(chunks));
  const contentType = request.headers['content-type'] ?? '';
  if (request.url === '/upload') {
    const form = await new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bytes,
    }).formData();
    response.end(JSON.stringify({ name: form.get('name') }));
  } else
    response.end(
      JSON.stringify({ url: request.url, body: new TextDecoder().decode(bytes), contentType }),
    );
}
const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    response.statusCode = 500;
    response.end(String(error));
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

test.each([false, true])(
  'real HTTP preserves URL, JSON, multipart and cancellation, strict=%s',
  async (strict) => {
    const options = { baseUrl, headers: { 'content-type': 'application/json' } };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    const result = await api
      .echo('中文😀/x')
      .post({ query: { q: 'a&b' }, body: { name: 'Ada' }, contentType: 'application/json' });
    expect(result).toEqual({
      url: '/echo/%E4%B8%AD%E6%96%87%F0%9F%98%80%2Fx?q=a%26b',
      body: '{"name":"Ada"}',
      contentType: 'application/json',
    });
    const body = new FormData();
    body.set('name', '中文😀');
    await expect(api.upload.post({ body, contentType: 'multipart/form-data' })).resolves.toEqual({
      name: '中文😀',
    });
    const controller = new AbortController();
    const pending = api.slow.get({ init: { signal: controller.signal } });
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      clearTimeout(timer);
    }
  },
);
