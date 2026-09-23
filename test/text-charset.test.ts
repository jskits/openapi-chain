import { expect, test } from 'vitest';
import { createClient, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = {
  '/x': {
    post: {
      requestBody: { content: Record<string, unknown> };
      responses: { 204: { content: never } };
    };
  };
};
function client(strict: boolean, contentType: string, transport: Transport) {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.1',
    paths: { '/x': { post: { requestBody: { content: { [contentType]: {} } } } } },
  });
  const options = { baseUrl: 'https://example.test', transport };
  return strict
    ? createStrictClient<Paths>({ ...options, metadata })
    : createClient<Paths>(options);
}
for (const strict of [false, true]) {
  test.each([
    ['text/plain; charset=iso-8859-1', 'café'],
    ['application/json; charset=utf-16', { text: 'café' }],
    ['application/x-www-form-urlencoded; charset=ascii', new URLSearchParams({ text: 'café' })],
  ])(`rejects mismatched generated charsets, strict=${strict}, %s`, async (contentType, body) => {
    let calls = 0;
    const type = contentType as string;
    const api = client(strict, type, async () => {
      calls++;
      return new Response(null, { status: 204 });
    });
    await expect(api.x.post({ contentType: type, body })).rejects.toThrow(/charset.*not supported/);
    expect(calls).toBe(0);
  });
  test.each([
    'text/plain; charset="UTF-8"',
    'text/plain; note="charset=latin1"; charset=utf-8',
    'text/plain; charset="utf\\-8"',
  ])(`UTF-8 parameters preserve bytes, strict=${strict}, %s`, async (contentType) => {
    const api = client(strict, contentType, async ({ url, init }) => {
      const request = new Request(url, init);
      expect(request.headers.get('content-type')).toBe(contentType);
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(
        new TextEncoder().encode('café😀'),
      );
      return new Response(null, { status: 204 });
    });
    await api.x.post({ contentType, body: 'café😀' });
  });
  test(`pre-encoded bytes and body extensions retain ownership, strict=${strict}`, async () => {
    const contentType = 'text/plain; charset=iso-8859-1';
    const bytes = new Uint8Array([99, 97, 102, 233]);
    let calls = 0;
    const api = client(strict, contentType, async ({ url, init }) => {
      expect(new Uint8Array(await new Request(url, init).arrayBuffer())).toEqual(bytes);
      calls++;
      return new Response(null, { status: 204 });
    });
    for (const body of [bytes, bytes.buffer, new Blob([bytes])])
      await api.x.post({ contentType, body });
    await api.x.post({ contentType, body: 'café', extensions: { body: () => bytes } });
    expect(calls).toBe(4);
  });
}
