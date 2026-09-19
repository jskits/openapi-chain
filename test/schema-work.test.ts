import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';

function compile(properties: Record<string, unknown>, schemas: Record<string, unknown> = {}) {
  return compileOpenAPIMetadata({
    openapi: '3.1.1',
    components: { schemas },
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties } } },
          },
        },
      },
    },
  });
}

test('shared schema DAG analysis is bounded by reusable nodes, not expanded branches', () => {
  let reads = 0;
  const leaf = {
    get type() {
      if (++reads > 1000) throw new Error('Repeated schema expansion exceeded the probe budget');
      return 'string';
    },
  };
  const schemas: Record<string, unknown> = { N0: leaf };
  for (let i = 1; i <= 28; i++)
    schemas[`N${i}`] = {
      allOf: [
        { $ref: `#/components/schemas/N${i - 1}` },
        { $ref: `#/components/schemas/N${i - 1}` },
      ],
    };
  const metadata = compile({ value: { $ref: '#/components/schemas/N28' } }, schemas);
  expect(
    metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes,
  ).toEqual({ value: 'text/plain' });
  expect(reads).toBeLessThan(1000);
});

test('caches are isolated to one compilation and account for sibling differences', () => {
  const text = { type: 'string' };
  expect(
    compile({ value: text }).operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes?.value,
  ).toBe('text/plain');
  text.type = 'object';
  expect(
    compile({ value: text }).operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes?.value,
  ).toBe('application/json');
});

test('cached subgraphs cannot bypass the schema depth limit', () => {
  let inner: unknown = { type: 'string' };
  for (let i = 0; i < 120; i++) inner = { type: 'array', items: inner };
  let outer = inner;
  for (let i = 0; i < 10; i++) outer = { type: 'array', items: outer };
  expect(() => compile({ warm: inner, deep: outer })).toThrow(/depth exceeds 128/);
});

test('bounds total schema traversal work independently of depth', () => {
  const leaf = { type: 'string' };
  const branches = Array.from({ length: 1_000_001 }, () => leaf);
  expect(() => compile({ value: { allOf: branches } })).toThrow(/compilation work budget exceeded/);
  expect(compile({ value: { type: 'string' } }).complete).toBe(true);
});
