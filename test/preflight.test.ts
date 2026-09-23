import { expect, test, vi } from 'vitest';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import type { RequestInput, Transport } from '../packages/core/src/index.js';

const metadata = compileOpenAPIMetadata({
  openapi: '3.2.0',
  paths: {
    '/x': { post: { requestBody: { content: { 'application/json': {} } } } },
    '/empty': { post: {} },
  },
});
test.each([
  { query: {}, querystring: {}, body: {} },
  { query: null, body: {} },
  { header: [], body: {} },
  { body: {}, contentType: 'text/plain' },
  { body: {}, contentType: 'application/*' },
  { body: {}, contentType: 42 },
  { contentType: 'application/json' },
])('structural input errors fail before all callbacks: %j', async (invalid) => {
  const transport = vi.fn<Transport>();
  const callback = vi.fn<() => string>(() => '{}');
  const headers = vi.fn<() => HeadersInit>(() => ({}));
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    headers,
    transport,
  }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
  await expect(
    api.x.post({
      ...invalid,
      extensions: { body: callback, query: callback, cookie: callback, header: headers },
    } as unknown as RequestInput),
  ).rejects.toThrow(TypeError);
  expect(callback).not.toHaveBeenCalled();
  expect(headers).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test('an undeclared body is rejected before header factories and body extensions', async () => {
  const headers = vi.fn<() => HeadersInit>(() => ({}));
  const body = vi.fn<() => string>(() => '{}');
  const transport = vi.fn<Transport>();
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    headers,
    transport,
  }) as unknown as { empty: { post(input: RequestInput): Promise<unknown> } };
  await expect(
    api.empty.post({ body: {}, contentType: 'application/json', extensions: { body } }),
  ).rejects.toThrow(/does not declare a request body/);
  expect(headers).not.toHaveBeenCalled();
  expect(body).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
