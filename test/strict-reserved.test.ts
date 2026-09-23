import { expect, test, vi } from 'vitest';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createClient, httpMethods, type HttpMethod, type Transport } from '../src/index.js';

type Op = { responses: { 204: { content: never } } };

test('every HTTP method name can be a static strict segment when the parent has no such operation', async () => {
  type Paths = { [M in `/${HttpMethod}`]: { get: Op } };
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.1',
    paths: Object.fromEntries(httpMethods.map((method) => [`/${method}`, { get: {} }])),
  });
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata, transport });
  for (const method of httpMethods) await api[method].get();
  expect(transport.mock.calls.map(([r]) => r.url)).toEqual(
    httpMethods.map((method) => `https://api.test/${method}`),
  );
  expect(await Promise.resolve(api)).toBe(api);
  const core = createClient<Paths>({ baseUrl: 'https://api.test' });
  // @ts-expect-error core remains schema-free and reserves method names
  void core.query.get;
});

test('node-local method priority preserves QUERY inputs and exact escape while other nodes allow query segments', async () => {
  type Paths = {
    '/search': { query: { parameters: { query: { q: string } }; responses: Op['responses'] } };
    '/search/query': { get: Op };
    '/other/query/{id}/': { parameters: { path: { id: string } }; get: Op };
    '/then': { get: Op };
    '/$path': { get: Op };
  };
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.1',
    paths: {
      '/search': {
        query: {
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        },
      },
      '/search/query': { get: {} },
      '/other/query/{id}/': {
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        },
      },
      '/then': { get: {} },
      '/$path': { get: {} },
    },
  });
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata, transport });
  await api.search.query({ query: { q: 'hello' } });
  // @ts-expect-error QUERY takes precedence at this node
  expect(api.search.query.get).toBeUndefined();
  // @ts-expect-error then remains reserved to prevent Promise assimilation
  expect(api.then).toBeUndefined();
  await api.$path('/search/query').get();
  await api.other.query('a/b').get();
  await api.$path('/then').get();
  await api.$path('/$path').get();
  expect(transport.mock.calls.map(([r]) => [r.method, r.url])).toEqual([
    ['query', 'https://api.test/search?q=hello'],
    ['get', 'https://api.test/search/query'],
    ['get', 'https://api.test/other/query/a%2Fb/'],
    ['get', 'https://api.test/then'],
    ['get', 'https://api.test/$path'],
  ]);
});

test('schema narrowing cannot hide runtime method occupancy or slash ambiguity', async () => {
  type Paths = {
    '/{id}': { parameters: { path: { id: number } }; query: Op; get: Op };
    '/{name}/': { parameters: { path: { name: string } }; get: Op };
    '/{name}/query': { parameters: { path: { name: string } }; get: Op };
  };
  const parameter = (name: string, type: string) => [
    { name, in: 'path', required: true, schema: { type } },
  ];
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.1',
    paths: {
      '/{id}': { parameters: parameter('id', 'integer'), query: {}, get: {} },
      '/{name}/': { parameters: parameter('name', 'string'), get: {} },
      '/{name}/query': { parameters: parameter('name', 'string'), get: {} },
    },
  });
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata, transport });
  // @ts-expect-error runtime routing has no schema-type discrimination
  void api('name').query;
  // @ts-expect-error runtime cannot distinguish the same GET chain shape
  await expect(api(1).get()).rejects.toThrow(/Ambiguous/);
  expect(transport).not.toHaveBeenCalled();
  await api.$path('/{name}/query', { name: 'name' }).get();
  expect(transport).toHaveBeenCalledOnce();
});
