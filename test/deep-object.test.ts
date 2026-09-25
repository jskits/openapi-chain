import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

type Client = {
  x: {
    get(input: { query: Record<string, unknown> }): Promise<unknown>;
    post(input: { contentType: string; body: Record<string, unknown> }): Promise<unknown>;
  };
};
// OAS 3.2: explode "has no effect" for deepObject, and its default is false.
const spellings = [{}, { explode: false }, { explode: true }];

function client(openapi: string, spelling: object, wire: string[]) {
  const metadata = compileOpenAPIMetadata({
    openapi,
    paths: {
      '/x': {
        get: {
          parameters: [
            {
              name: 'f',
              in: 'query',
              style: 'deepObject',
              schema: { type: 'object' },
              ...spelling,
            },
          ],
        },
        post: {
          requestBody: {
            content: Object.fromEntries(
              ['application/x-www-form-urlencoded', 'multipart/form-data'].map((media) => [
                media,
                {
                  schema: { type: 'object', properties: { f: { type: 'object' } } },
                  encoding: { f: { style: 'deepObject', ...spelling } },
                },
              ]),
            ),
          },
        },
      },
    },
  });
  const api = createStrictClient({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      if (init.body instanceof FormData)
        wire.push(JSON.stringify([...(await request.formData()).entries()]));
      else
        wire.push(`${new URL(url).search} ${init.body === undefined ? '' : await request.text()}`);
      return new Response(null, { status: 204 });
    },
  }) as unknown as Client;
  return { api, metadata };
}

test.each(['3.0.3', '3.1.1', '3.2.0'])(
  'deepObject compiles and serializes identically for every explode spelling in %s',
  async (openapi) => {
    const results = [];
    for (const spelling of spellings) {
      const wire: string[] = [];
      const { api, metadata } = client(openapi, spelling, wire);
      await api.x.get({ query: { f: { a: '1', b: 'x y' } } });
      await api.x.post({
        contentType: 'application/x-www-form-urlencoded',
        body: { f: { a: '1' } },
      });
      await api.x.post({ contentType: 'multipart/form-data', body: { f: { a: '1' } } });
      results.push({ wire, metadata: JSON.parse(JSON.stringify(metadata)) });
    }
    expect(results[0]!.wire).toEqual([
      '?f%5Ba%5D=1&f%5Bb%5D=x%20y ',
      ' f%5Ba%5D=1',
      '[["f[a]","1"]]',
    ]);
    for (const result of results) expect(result).toEqual(results[0]);
  },
);
