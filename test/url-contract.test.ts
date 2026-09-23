import { expect, test } from 'vitest';
import { createClient, type RequestInput } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: { '/x': { get: { parameters: [{ name: 'a', in: 'query', schema: {} }] } } },
});
test.each([
  ['https://api.test/root?', 'https://api.test/root/x?a=b'],
  ['https://api.test/root?x=1&', 'https://api.test/root/x?x=1&a=b'],
  ['https://api.test/root///?x=1&#hash', 'https://api.test/root/x?x=1&a=b#hash'],
  ['https://api.test/root#hash?x', 'https://api.test/root/x?a=b#hash?x'],
])('core and strict share URL suffix handling: %s', async (baseUrl, expected) => {
  for (const strict of [false, true]) {
    let url: string | undefined;
    const options = {
      baseUrl,
      transport: async (request: { url: string }) => {
        url = request.url;
        return new Response(null, { status: 204 });
      },
    };
    const api = (strict
      ? createStrictClient({ ...options, metadata })
      : createClient(options)) as unknown as { x: { get(input: RequestInput): Promise<unknown> } };
    await api.x.get({ query: { a: 'b' } });
    expect(url).toBe(expected);
  }
});
