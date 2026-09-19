import { expect, test } from 'vitest';
import { createClient, type Transport } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Operation = { get: { responses: { 204: { content: never } } } };
type Paths = { '/items': Operation; '/items/': Operation; '//items': Operation; '/': Operation };
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.1',
  paths: {
    '/items': { get: {} },
    '/items/': { get: {} },
    '//items': { get: {} },
    '/': { get: {} },
  },
});

test.each([false, true])(
  'preserves exact slash structure through $path, strict=%s',
  async (strict) => {
    const urls: string[] = [];
    const transport: Transport = async ({ url }) => {
      urls.push(new Request(url).url);
      return new Response(null, { status: 204 });
    };
    const options = { baseUrl: 'https://example.test/api', transport };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    await api.items.get();
    await api.$path('/items/').get();
    await api.$path('//items').get();
    await api.get();
    expect(urls).toEqual([
      'https://example.test/api/items',
      'https://example.test/api/items/',
      'https://example.test/api//items',
      'https://example.test/api/',
    ]);
  },
);
