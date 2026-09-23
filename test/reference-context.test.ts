import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

test.each(['3.0.4', '3.1.1', '3.2.1'])(
  'Reference Object siblings cannot weaken inputs in %s',
  async (openapi) => {
    const metadata = compileOpenAPIMetadata({
      openapi,
      components: {
        parameters: { Q: { name: 'q', in: 'query', required: true, schema: { type: 'string' } } },
        requestBodies: {
          Body: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
      paths: {
        '/x': {
          post: {
            parameters: [
              {
                $ref: '#/components/parameters/Q',
                required: false,
                name: 'ignored',
                summary: 'annotation',
              },
            ],
            requestBody: {
              $ref: '#/components/requestBodies/Body',
              required: false,
              content: { 'text/plain': {} },
            },
          },
        },
      },
    });
    const operation = metadata.operations['/x']?.post;
    expect(operation?.parameters?.query?.q?.required).toBe(true);
    expect(operation?.parameters?.query?.ignored).toBeUndefined();
    expect(operation?.requestBody).toMatchObject({
      required: true,
      mediaTypes: ['application/json'],
    });
    const api = createStrictClient<{ '/x': { post: { responses: { 204: { content: never } } } } }>({
      baseUrl: 'https://example.test',
      metadata,
      transport: async () => {
        throw new Error('transport must not run');
      },
    });
    await expect(api.x.post()).rejects.toThrow(/Missing required/);
  },
);

function schemaMetadata(openapi: string, sibling: unknown) {
  return compileOpenAPIMetadata({
    openapi,
    components: {
      schemas: { Base: { type: 'object', properties: { value: { type: 'string' } } } },
    },
    paths: {
      '/x': { post: { requestBody: { content: { 'multipart/form-data': { schema: sibling } } } } },
    },
  });
}
test.each(['3.1.1', '3.2.1'])('schema reference siblings are conjunctive in %s', (openapi) => {
  const metadata = schemaMetadata(openapi, {
    $ref: '#/components/schemas/Base',
    properties: { value: { minLength: 1 }, extra: { type: 'integer' } },
  });
  expect(
    metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes,
  ).toEqual({ value: 'text/plain', extra: 'text/plain' });
});
test('OAS 3.0 schema references ignore siblings', () => {
  const metadata = schemaMetadata('3.0.4', {
    $ref: '#/components/schemas/Base',
    properties: { extra: { type: 'integer' } },
  });
  expect(
    metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes,
  ).toEqual({ value: 'text/plain' });
});
test('schema sibling cache entries do not alias by reference string', () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.1',
    components: { schemas: { Empty: {} } },
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  properties: {
                    text: { $ref: '#/components/schemas/Empty', type: 'string' },
                    object: { $ref: '#/components/schemas/Empty', type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  expect(
    metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes,
  ).toEqual({ text: 'text/plain', object: 'application/json' });
});
test('Path Item refs preserve disjoint fields and reject ambiguous overlaps', () => {
  const document = {
    openapi: '3.1.1',
    components: { pathItems: { Base: { get: {} } } },
    paths: { '/x': { $ref: '#/components/pathItems/Base', post: {} } },
  };
  expect(compileOpenAPIMetadata(document).operations['/x']).toEqual({ get: {}, post: {} });
  expect(() =>
    compileOpenAPIMetadata({
      ...document,
      paths: { '/x': { $ref: '#/components/pathItems/Base', get: {} } },
    }),
  ).toThrow(/Ambiguous Path Item/);
});

test.each(['3.1.1', '3.2.1'])('nested repeated references are acyclic in %s', (openapi) => {
  const ref = { $ref: '#/components/schemas/Base' };
  for (const schema of [
    { ...ref, allOf: [{ ...ref, description: 'same target' }] },
    { allOf: [ref, { ...ref, description: 'same target' }] },
  ]) {
    expect(
      schemaMetadata(openapi, schema).operations['/x']?.post?.requestBody?.media?.[
        'multipart/form-data'
      ]?.propertyContentTypes,
    ).toEqual({ value: 'text/plain' });
  }
});
