import { expect, test } from 'vitest';
import { createClient, OpenAPIChainError, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type NoContent = { responses: { 204: { content: never } } };
type Paths = {
  '/items/{id}': { parameters: { path: { id: string | number } }; delete: NoContent };
  '/users/{id}/posts': { parameters: { path: { id: string } }; get: NoContent };
  '/reports/{id}.json': { parameters: { path: { id: string } }; get: NoContent };
  '/legacy//items': { get: NoContent };
};
const path = (name: string, extra: object = {}) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  ...extra,
});
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.1',
  paths: {
    '/items/{id}': { delete: { parameters: [path('id')] } },
    '/users/{id}/posts': { get: { parameters: [path('id')] } },
    '/reports/{id}.json': { get: { parameters: [path('id')] } },
    '/legacy//items': { get: {} },
  },
});

function clients() {
  const urls: string[] = [];
  const transport: Transport = async ({ url }) => {
    urls.push(url);
    return new Response(null, { status: 204 });
  };
  const options = { baseUrl: 'https://example.test/api', transport };
  return {
    urls,
    apis: [createClient<Paths>(options), createStrictClient<Paths>({ ...options, metadata })],
  };
}
const empty = (error: unknown) =>
  error instanceof OpenAPIChainError &&
  error.code === 'UNSAFE_PATH' &&
  /empty path segment/.test(error.message);

test('empty path values fail before transport instead of changing the route', async () => {
  const { urls, apis } = clients();
  for (const api of apis) {
    await expect(api.items('').delete()).rejects.toSatisfy(empty);
    await expect(api.$path('/items/{id}', { id: '' }).delete()).rejects.toSatisfy(empty);
    await expect(api.users('').posts.get()).rejects.toSatisfy(empty);
    await expect(api.$path('/users/{id}/posts', { id: '' }).get()).rejects.toSatisfy(empty);
    await expect(api.$path('/reports/{id}.json', { id: '' }).get()).rejects.toSatisfy(empty);
    await expect(api.items('x').delete({ extensions: { path: () => '' } })).rejects.toSatisfy(
      empty,
    );
  }
  expect(urls).toEqual([]);
});

test('non-empty and falsy-looking values, and literal empty template segments, still work', async () => {
  const { urls, apis } = clients();
  for (const api of apis) {
    await api.items(0).delete();
    await api.items('0').delete();
    await api.$path('/reports/{id}.json', { id: 'r1' }).get();
    await api.$path('/legacy//items').get();
  }
  const expected = [
    'https://example.test/api/items/0',
    'https://example.test/api/items/0',
    'https://example.test/api/reports/r1.json',
    'https://example.test/api/legacy//items',
  ];
  expect(urls).toEqual([...expected, ...expected]);
});

test('strict styles cannot render an empty or dot path segment', async () => {
  type StylePaths = {
    '/tags/{ids}': { parameters: { path: { ids: string[] } }; get: NoContent };
    '/labels/{id}': { parameters: { path: { id: string } }; get: NoContent };
  };
  let calls = 0;
  const api = createStrictClient<StylePaths>({
    baseUrl: 'https://example.test',
    metadata: compileOpenAPIMetadata({
      openapi: '3.1.1',
      paths: {
        '/tags/{ids}': {
          get: {
            parameters: [path('ids', { schema: { type: 'array', items: { type: 'string' } } })],
          },
        },
        '/labels/{id}': { get: { parameters: [path('id', { style: 'label' })] } },
      },
    }),
    transport: async () => (calls++, new Response(null, { status: 204 })),
  });
  await expect(api.tags([]).get()).rejects.toSatisfy(empty);
  await expect(api.labels('').get()).rejects.toThrow(/Dot path segments/);
  expect(calls).toBe(0);
  await api.tags(['a', 'b']).get();
  await api.labels('x').get();
  expect(calls).toBe(2);
});
