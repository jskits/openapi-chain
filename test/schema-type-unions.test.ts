import { expect, test, vi } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: {
        content: {
          'multipart/form-data': { value: unknown };
          'application/x-www-form-urlencoded': { value: unknown };
          'application/json': { value: unknown };
        };
      };
      responses: { 204: { content: never } };
    };
  };
};
function compile(schema: unknown, contentType: string, version: string) {
  return compileOpenAPIMetadata({
    openapi: version,
    components: { schemas: { Union: { type: ['null', 'string', 'object'] } } },
    paths: { '/upload': { post: { requestBody: { content: { [contentType]: { schema } } } } } },
  });
}
for (const version of ['3.1.1', '3.2.1'])
  for (const contentType of ['multipart/form-data', 'application/x-www-form-urlencoded'] as const)
    test(`ambiguous types require an extension: ${version} ${contentType}`, async () => {
      const variants = [
        { type: ['string', 'object'] },
        { type: ['object', 'string', 'null'] },
        { type: ['integer', 'number'] },
        { type: ['string', 'object'], properties: { x: { type: 'string' } } },
        { $ref: '#/components/schemas/Union' },
        { allOf: [{ type: 'string' }, { $ref: '#/components/schemas/Union' }] },
        { type: 'array', items: { $ref: '#/components/schemas/Union' } },
      ];
      const schemas = [
        ...variants.map((value) => ({ type: 'object', properties: { value } })),
        { type: ['object', 'string'], properties: { value: { type: 'string' } } },
      ];
      for (const schema of schemas) {
        const metadata = compile(schema, contentType, version);
        const media = metadata.operations['/upload']?.post?.requestBody?.media?.[contentType];
        expect(media?.requiresCustomSerializer).toMatch(/Multiple non-null schema types/);
        expect(media?.propertyKinds).toBeUndefined();
        expect(media?.propertyContentTypes).toBeUndefined();
        const transport = vi.fn<() => Promise<Response>>(
          async () => new Response(null, { status: 204 }),
        );
        const api = createStrictClient<Paths>({
          baseUrl: 'https://example.test',
          metadata,
          transport,
        });
        await expect(api.upload.post({ contentType, body: { value: 'hello' } })).rejects.toThrow(
          /body extension/,
        );
        expect(transport).not.toHaveBeenCalled();
        await api.upload.post({
          contentType,
          body: { value: 'hello' },
          extensions: { body: () => new URLSearchParams({ value: 'hello' }) },
        });
        expect(transport).toHaveBeenCalledOnce();
      }
    });

test.each([
  ['string', 'null'],
  ['null', 'string'],
  ['string', 'string', 'null'],
])('nullable single type retains inference: %j', (...type) => {
  const metadata = compile({ properties: { value: { type } } }, 'multipart/form-data', '3.1.1');
  expect(metadata.operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']).toEqual(
    {
      propertyKinds: { value: 'primitive' },
      propertyContentTypes: { value: 'text/plain' },
    },
  );
});

test('explicit JSON serialization supports union types', async () => {
  const metadata = compile(
    { properties: { value: { type: ['string', 'object'] } } },
    'application/json',
    '3.1.1',
  );
  const api = createStrictClient<Paths>({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ init }) => {
      expect(init.body).toBe('{"value":{"x":1}}');
      return new Response(null, { status: 204 });
    },
  });
  await api.upload.post({ contentType: 'application/json', body: { value: { x: 1 } } });
});

test.each(['*/*', 'application/*', 'multipart/*'])(
  'media ranges cannot bypass ambiguous form inference: %s',
  async (declaration) => {
    const metadata = compile(
      { properties: { value: { type: ['string', 'object'] } } },
      declaration,
      '3.1.1',
    );
    const transport = vi.fn<() => Promise<Response>>(
      async () => new Response(null, { status: 204 }),
    );
    const api = createStrictClient<Paths>({ baseUrl: 'https://example.test', metadata, transport });
    const contentType =
      declaration === 'application/*' ? 'application/x-www-form-urlencoded' : 'multipart/form-data';
    await expect(api.upload.post({ contentType, body: { value: 'hello' } })).rejects.toThrow(
      /Multiple non-null/,
    );
    expect(transport).not.toHaveBeenCalled();
  },
);

test('explicit part media does not override an ambiguous schema kind', () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.1',
    paths: {
      '/upload': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  properties: { value: { type: ['string', 'array'], items: { type: 'string' } } },
                },
                encoding: { value: { contentType: 'text/plain' } },
              },
            },
          },
        },
      },
    },
  });
  expect(
    metadata.operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']
      ?.requiresCustomSerializer,
  ).toMatch(/Multiple non-null/);
});

test('recursive JSON arrays do not require serialization inference', () => {
  expect(
    compileOpenAPIMetadata({
      openapi: '3.1.1',
      components: {
        schemas: { Node: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
      },
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } },
            },
          },
        },
      },
    }).complete,
  ).toBe(true);
});
