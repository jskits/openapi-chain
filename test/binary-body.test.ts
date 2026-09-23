import { expect, test } from 'vitest';
import { createClient } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = {
  '/binary': {
    post: {
      requestBody: { content: { 'application/octet-stream': ArrayBufferView<ArrayBuffer> } };
      responses: { 204: { content: never } };
    };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.1',
  paths: { '/binary': { post: { requestBody: { content: { 'application/octet-stream': {} } } } } },
});

test.each([false, true])('sends only selected binary view bytes, strict=%s', async (strict) => {
  const buffer = new Uint8Array([99, 65, 66, 67, 98]).buffer;
  const values = [
    new Uint8Array(buffer, 1, 3),
    new DataView(buffer, 1, 3),
    Buffer.from(buffer, 1, 3),
  ];
  let calls = 0;
  const options = {
    baseUrl: 'https://example.test',
    transport: async ({ url, init }: { url: string; init: RequestInit }) => {
      const request = new Request(url, init);
      expect(request.headers.get('content-type')).toBe('application/octet-stream');
      expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([65, 66, 67]);
      calls++;
      return new Response(null, { status: 204 });
    },
  };
  const api = strict
    ? createStrictClient<Paths>({ ...options, metadata })
    : createClient<Paths>(options);
  for (const body of values)
    await api.binary.post({ contentType: 'application/octet-stream', body });
  expect(calls).toBe(values.length);
});
