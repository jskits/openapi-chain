import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { RequestInput } from '../packages/core/src/index.js';

const media = {
  schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } },
  encoding: { tags: { style: 'form', explode: false } },
};
const reference = {
  $ref: '#/components/mediaTypes/Tags',
  // Reference Object siblings cannot override the target's serialization.
  encoding: { tags: { style: 'form', explode: true } },
};

test.each(['application/x-www-form-urlencoded', 'multipart/form-data'])(
  'OAS 3.2 media references retain body Encoding rules for %s',
  async (contentType) => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.0',
      components: { mediaTypes: { Tags: media } },
      paths: { '/x': { post: { requestBody: { content: { [contentType]: reference } } } } },
    });
    let received: string[] = [];
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport: async ({ url, init }) => {
        received = (await new Request(url, init).formData()).getAll('tags') as string[];
        return new Response(null, { status: 204 });
      },
    }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
    await api.x.post({ body: { tags: ['a', 'b'] } });
    expect(received).toEqual(['a,b']);
  },
);

test('OAS 3.2 querystring content resolves Media Type references', async () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    components: { mediaTypes: { Tags: media } },
    paths: {
      '/x': {
        get: {
          parameters: [
            {
              in: 'querystring',
              name: 'filter',
              content: { 'application/x-www-form-urlencoded': reference },
            },
          ],
        },
      },
    },
  });
  let received = '';
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    transport: async ({ url }) => {
      received = url;
      return new Response(null, { status: 204 });
    },
  }) as unknown as { x: { get(input: RequestInput): Promise<unknown> } };
  await api.x.get({ querystring: { filter: { tags: ['a', 'b'] } } });
  expect(received).toBe('https://api.test/x?tags=a,b');
});

test.each([
  './media.yaml#/Tags',
  '#/components/mediaTypes/Missing',
  '#/components/mediaTypes/Loop',
])('invalid Media Type reference fails compilation: %s', ($ref) => {
  expect(() =>
    compileOpenAPIMetadata({
      openapi: '3.2.0',
      components: { mediaTypes: { Loop: { $ref: '#/components/mediaTypes/Loop' } } },
      paths: {
        '/x': { post: { requestBody: { content: { 'application/json': { $ref } } } } },
      },
    }),
  ).toThrow(expect.objectContaining({ code: 'METADATA_COMPILE' }));
});
