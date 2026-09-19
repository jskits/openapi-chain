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

test.each(['', '/', '?existing=1', '#fragment', '/?existing=1#fragment'])(
  'core preserves replacement tokens in paths with base suffix %s',
  async (suffix) => {
    type DollarPaths = {
      '/price/$$': Operation;
      '/price/$&': Operation;
      '/price/{id}': { parameters: { path: { id: string } } } & Operation;
    };
    const urls: string[] = [];
    const api = createClient<DollarPaths>({
      baseUrl: `https://example.test/api${suffix}`,
      transport: async ({ url }) => {
        urls.push(url);
        return new Response(null, { status: 204 });
      },
    });
    await api.price['$$'].get();
    await api.$path('/price/$&').get();
    await api.price('x').get({ extensions: { path: () => "$'" } });
    const tail = suffix.replace(/^\//, '');
    expect(urls).toEqual(
      ['$$', '$&', "$'"].map((value) => `https://example.test/api/price/${value}${tail}`),
    );
  },
);

test.each(['3.0.4', '3.1.1', '3.2.1'])('static path wire invariance in %s', async (openapi) => {
  const paths = ['/price/$$', '/price/$&', "/price/$'", '/price/a&b', '/price/%24'] as const;
  type StaticPaths = { [P in (typeof paths)[number]]: Operation };
  const compiled = compileOpenAPIMetadata({
    openapi,
    paths: Object.fromEntries(paths.map((path) => [path, { get: {} }])),
  });
  for (const baseUrl of ['https://example.test', 'https://example.test/api/?q=1#anchor']) {
    for (const strict of [false, true]) {
      const urls: string[] = [];
      const transport: Transport = async ({ url, init }) => {
        urls.push(new Request(url, init).url);
        return new Response(null, { status: 204 });
      };
      const options = { baseUrl, transport };
      const api = strict
        ? createStrictClient<StaticPaths>({ ...options, metadata: compiled })
        : createClient<StaticPaths>(options);
      for (const path of paths) await api.$path(path).get();
      await api.price['$$'].get();
      await api.price['$&'].get();
      const expected = [...paths, '/price/$$', '/price/$&'].map((path) => {
        const url = new URL(baseUrl);
        url.pathname = url.pathname.replace(/\/$/, '') + path;
        return url.href;
      });
      expect(urls).toEqual(expected);
    }
  }
});
