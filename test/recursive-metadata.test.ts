import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

function compile(
  node: unknown,
  schema: unknown = { properties: { node: { $ref: '#/components/schemas/Node' } } },
) {
  return compileOpenAPIMetadata({
    openapi: '3.2.1',
    components: { schemas: { Node: node } },
    paths: { '/x': { post: { requestBody: { content: { 'multipart/form-data': { schema } } } } } },
  });
}
test.each([
  { allOf: [{ $ref: '#/components/schemas/Node' }] },
  { type: 'array', items: { $ref: '#/components/schemas/Node' } },
])('rejects recursive serialization inference with a controlled error', (node) => {
  expect(() => compile(node)).toThrow(/Recursive OpenAPI schema/);
});
test('allows ordinary recursive object properties and repeated acyclic references', () => {
  const node = { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } };
  const metadata = compile(node, {
    allOf: [
      { properties: { a: { $ref: '#/components/schemas/Node' } } },
      { properties: { b: { $ref: '#/components/schemas/Node' } } },
    ],
  });
  expect(
    metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes,
  ).toEqual({ a: 'application/json', b: 'application/json' });
});
test('bounds schema inference depth without stack overflow', () => {
  let node: unknown = { type: 'string' };
  for (let i = 0; i < 150; i++) node = { type: 'array', items: node };
  expect(() => compile(node)).toThrow(/depth exceeds 128/);
  expect(compile({ type: 'string' }).complete).toBe(true);
});

test('bounds recursive root composition', () => {
  expect(() =>
    compile(
      { allOf: [{ $ref: '#/components/schemas/Node' }] },
      { $ref: '#/components/schemas/Node' },
    ),
  ).toThrow(/Recursive OpenAPI schema/);
});

test('bounds long acyclic reference chains before recursive dereferencing overflows', () => {
  const schemas: Record<string, unknown> = { N150: { type: 'string' } };
  for (let i = 0; i < 150; i++) schemas[`N${i}`] = { $ref: `#/components/schemas/N${i + 1}` };
  expect(() =>
    compileOpenAPIMetadata({
      openapi: '3.1.0',
      components: { schemas },
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: { properties: { value: { $ref: '#/components/schemas/N0' } } },
                },
              },
            },
          },
        },
      },
    }),
  ).toThrow(/reference depth exceeds 128/);
});

test.each([
  'application/json',
  'application/problem+json',
  'text/plain',
  'application/octet-stream',
  '*/*',
])('does not infer recursive form fields for %s', (contentType) => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.0',
    components: {
      schemas: { Node: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
    },
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              [contentType]: {
                schema: { properties: { node: { $ref: '#/components/schemas/Node' } } },
              },
            },
          },
        },
      },
    },
  });
  const media = metadata.operations['/x']!.post!.requestBody!.media?.[contentType];
  const reason = expect.stringMatching(/Recursive/);
  expect(media).toEqual(
    contentType === '*/*'
      ? { customSerializerScope: 'form', requiresCustomSerializer: reason }
      : undefined,
  );
});
