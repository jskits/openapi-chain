import { expect, test } from 'vitest';
import { createClient, type TransportRequest } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = {
  '/x/{id}': {
    parameters: { path: { id: string } };
    get: { parameters: { query: { q: string } }; responses: { 204: { content: never } } };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.2.1',
  paths: {
    '/x/{id}': {
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        ],
      },
    },
  },
});
function corpus() {
  const alphabet = ['a', ' ', '😀', '中', '%', '/', '?', '#', '&', '+', '=', "'", '.', '\0'];
  let seed = 0x12345678;
  return Array.from({ length: 256 }, () => {
    let value = 'v';
    for (let i = 0; i < 24; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      value += alphabet[seed % alphabet.length]!;
    }
    return value;
  });
}
test.each([false, true])(
  'seeded Unicode/delimiter corpus round-trips through Fetch URLs, strict=%s',
  async (strict) => {
    let expected = '';
    let calls = 0;
    const transport = async (request: TransportRequest) => {
      const url = new URL(new Request(request.url, request.init).url);
      expect(url.origin).toBe('https://example.test');
      expect(url.hash).toBe('');
      expect(url.pathname.split('/')).toHaveLength(3);
      expect(decodeURIComponent(url.pathname.slice('/x/'.length))).toBe(expected);
      expect([...url.searchParams]).toEqual([['q', expected]]);
      calls++;
      return new Response(null, { status: 204 });
    };
    const options = { baseUrl: 'https://example.test', transport };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    for (const value of corpus()) {
      expected = value;
      await api.x(value).get({ query: { q: value } });
      await api.$path('/x/{id}', { id: value }).get({ query: { q: value } });
    }
    expect(calls).toBe(512);
  },
);
