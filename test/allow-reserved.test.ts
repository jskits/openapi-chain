import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

type Client = {
  $path(
    template: string,
    params: Record<string, string>,
  ): {
    get(input: Record<string, unknown>): Promise<unknown>;
  };
};

function client(openapi: string, urls: string[]) {
  const reserved = (name: string, location: string) => ({
    name,
    in: location,
    required: location === 'path',
    allowReserved: true,
    schema: { type: 'string' },
  });
  const metadata = compileOpenAPIMetadata({
    openapi,
    paths: {
      '/data/{path}': {
        get: {
          parameters: [
            reserved('path', 'path'),
            reserved('q', 'query'),
            reserved('X-Tag', 'header'),
          ],
        },
      },
    },
  });
  const api = createStrictClient({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ url, init }) => {
      urls.push(`${url} ${new Headers(init.headers).get('x-tag')}`);
      return new Response(null, { status: 204 });
    },
  }) as unknown as Client;
  return { api, metadata };
}

test.each(['3.0.3', '3.1.1'])(
  'allowReserved outside query has no effect in %s instead of rejecting the document',
  async (openapi) => {
    const urls: string[] = [];
    const { api, metadata } = client(openapi, urls);
    const parameters = metadata.operations['/data/{path}']?.get?.parameters;
    expect(parameters?.path?.path?.allowReserved).toBeUndefined();
    expect(parameters?.header?.['x-tag']?.allowReserved).toBeUndefined();
    expect(parameters?.query?.q?.allowReserved).toBe(true);
    await api.$path('/data/{path}', { path: 'a/b' }).get({
      query: { q: 'x/y' },
      header: { 'X-Tag': 'a/b' },
    });
    expect(urls).toEqual(['https://example.test/data/a%2Fb?q=x/y a/b']);
  },
);

test('OAS 3.2 path parameters apply allowReserved', async () => {
  const urls: string[] = [];
  const { api, metadata } = client('3.2.0', urls);
  expect(metadata.operations['/data/{path}']?.get?.parameters?.path?.path?.allowReserved).toBe(
    true,
  );
  await api.$path('/data/{path}', { path: 'a:b' }).get({ query: { q: 'x/y' } });
  expect(urls).toEqual(['https://example.test/data/a:b?q=x/y null']);
});
