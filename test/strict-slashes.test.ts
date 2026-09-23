import { expect, test, vi } from 'vitest';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import type { Transport } from '../src/index.js';

type Op = { responses: { 204: { content: never } } };
type Paths = {
  '/': { get: Op };
  '/items/': { get: Op };
  '/items': { post: Op };
  '/items/{id}/': { parameters: { path: { id: string } }; get: Op };
  '/both': { get: Op };
  '/both/': { get: Op; post: Op };
  '/repeat//': { get: Op };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.1',
  paths: {
    '/': { get: {} },
    '/items/': { get: {} },
    '/items': { post: {} },
    '/items/{id}/': {
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, style: 'label', schema: { type: 'string' } },
        ],
      },
    },
    '/both': { get: {} },
    '/both/': { get: {}, post: {} },
    '/repeat//': { get: {} },
  },
});

test('strict resolves trailing slashes per method and preserves path encoding and base suffixes', async () => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({
    baseUrl: 'https://api.test/v1/?base=1#hash',
    metadata,
    transport,
  });
  await api.get();
  await api.items.get();
  await api.items.post();
  await api.items('a/b').get();
  await api.items('value').get({ extensions: { path: (value) => `custom-${value}` } });
  await api.both.post();
  expect(transport.mock.calls.map(([r]) => r.url)).toEqual([
    'https://api.test/v1/?base=1#hash',
    'https://api.test/v1/items/?base=1#hash',
    'https://api.test/v1/items?base=1#hash',
    'https://api.test/v1/items/.a%2Fb/?base=1#hash',
    'https://api.test/v1/items/custom-value/?base=1#hash',
    'https://api.test/v1/both/?base=1#hash',
  ]);
});

test('ambiguous slash pairs fail closed while exact templates remain available', async () => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata, transport });
  // @ts-expect-error same-method slash pairs cannot be selected by a chain
  await expect(api.both.get()).rejects.toThrow(/Ambiguous/);
  // @ts-expect-error repeated trailing slashes still require $path
  await expect(api.repeat.get()).rejects.toThrow(/does not match/);
  expect(transport).not.toHaveBeenCalled();
  await api.$path('/both').get();
  await api.$path('/both/').get();
  await api.$path('/repeat//').get();
  expect(transport.mock.calls.map(([r]) => r.url)).toEqual([
    'https://api.test/both',
    'https://api.test/both/',
    'https://api.test/repeat//',
  ]);
});
