import { expect, test } from 'vitest';
import {
  createClient,
  type RequestInput,
  type TransportRequest,
} from '../packages/core/src/index.js';

type Runtime = {
  items(value: unknown): { get(input?: RequestInput): Promise<unknown> };
  $path(
    template: string,
    params: Record<string, unknown>,
  ): {
    get(input?: RequestInput): Promise<unknown>;
  };
};

function client() {
  const requests: TransportRequest[] = [];
  const api = createClient({
    baseUrl: 'https://api.test',
    transport: async (request) => {
      requests.push(request);
      return new Response(null, { status: 204 });
    },
  }) as unknown as Runtime;
  return { api, requests };
}

test.each([
  {
    name: 'chain path object',
    location: 'path',
    call: (api: Runtime) => api.items({ id: '42' }).get(),
  },
  {
    name: 'exact path object',
    location: 'path',
    call: (api: Runtime) => api.$path('/items/{id}', { id: { value: '42' } }).get(),
  },
  {
    name: 'nested path array',
    location: 'path',
    call: (api: Runtime) => api.items([['42']]).get(),
  },
  {
    name: 'header object',
    location: 'header x-test',
    call: (api: Runtime) => api.items('42').get({ header: { 'x-test': { value: 'a' } } }),
  },
  {
    name: 'nested header array',
    location: 'header x-test',
    call: (api: Runtime) => api.items('42').get({ header: { 'x-test': ['a', { value: 'b' }] } }),
  },
  {
    name: 'query array object',
    location: 'query tags',
    call: (api: Runtime) => api.items('42').get({ query: { tags: [{ value: 'a' }] } }),
  },
  {
    name: 'nested query array',
    location: 'query tags',
    call: (api: Runtime) => api.items('42').get({ query: { tags: [['a']] } }),
  },
  {
    name: 'nested query object',
    location: 'query filter',
    call: (api: Runtime) => api.items('42').get({ query: { filter: { nested: { a: 1 } } } }),
  },
  {
    name: 'cookie object',
    location: 'cookie session',
    call: (api: Runtime) => api.items('42').get({ cookie: { session: { id: 'a' } } }),
  },
  {
    name: 'nested cookie array',
    location: 'cookie session',
    call: (api: Runtime) => api.items('42').get({ cookie: { session: [['a']] } }),
  },
])('core rejects $name before transport', async ({ call, location }) => {
  const { api, requests } = client();
  await expect(call(api)).rejects.toMatchObject({
    name: 'OpenAPIChainError',
    code: 'SERIALIZATION',
    method: 'GET',
    message: expect.stringContaining(`Structured ${location} value`),
  });
  expect(requests).toEqual([]);
});

test('core keeps scalar and flat collection defaults', async () => {
  const { api, requests } = client();
  await api.$path('/items/{id}', { id: ['a', 'b'] }).get({
    query: { tags: ['a', 'b'], filter: { color: 'blue', page: 2 } },
    header: { 'x-tags': ['a', 'b'] },
    cookie: { session: ['a', 'b'] },
  });
  expect(requests[0]?.url).toBe('https://api.test/items/a%2Cb?tags=a&tags=b&color=blue&page=2');
  expect(new Headers(requests[0]?.init.headers).get('x-tags')).toBe('a,b');
  expect(new Headers(requests[0]?.init.headers).get('cookie')).toBe('session=a; session=b');

  await api.items(0).get();
  expect(requests[1]?.url).toBe('https://api.test/items/0');
});

test('location extensions can serialize structured values explicitly', async () => {
  const { api, requests } = client();
  await api.$path('/items/{id}', { id: { value: '42' } }).get({
    query: { filter: { nested: { a: 1 } } },
    header: { 'x-test': { value: 'a' } },
    cookie: { session: { id: 'a' } },
    extensions: {
      path: () => '42',
      query: () => 'filter=ok',
      header: () => ({ 'x-test': 'ok' }),
      cookie: () => 'session=ok',
    },
  });
  expect(requests[0]?.url).toBe('https://api.test/items/42?filter=ok');
  expect(new Headers(requests[0]?.init.headers).get('x-test')).toBe('ok');
  expect(new Headers(requests[0]?.init.headers).get('cookie')).toBe('session=ok');
});
