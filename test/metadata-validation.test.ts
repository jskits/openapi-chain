import { describe, expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

function operation(value: unknown) {
  return compileOpenAPIMetadata({ openapi: '3.2.1', paths: { '/x': { post: value } } });
}

describe('metadata rejects malformed documents before transport', () => {
  test.each([null, [], {}, { openapi: 3 }, { openapi: '2.0' }, { openapi: '3.1.0', paths: [] }])(
    'document %j',
    (document) => {
      expect(() => compileOpenAPIMetadata(document)).toThrow(TypeError);
    },
  );
  test.each([
    {},
    { name: '', in: 'query', schema: {} },
    { name: 'q', in: 'invalid', schema: {} },
    { name: 'q', in: 'query' },
    { name: 'q', in: 'query', schema: {}, content: {} },
    { name: 'q', in: 'query', content: {} },
    { name: 'q', in: 'query', content: { a: {}, b: {} } },
    { name: 'q', in: 'query', content: { 'text/plain': {} }, style: 'form' },
    { name: 'q', in: 'query', schema: {}, explode: 'yes' },
    { name: 'q', in: 'query', schema: {}, allowReserved: 'yes' },
    { name: 'q', in: 'query', schema: {}, style: 'spaceDelimited', explode: true },
    { name: 'q', in: 'path', schema: {} },
    { name: 'q', in: 'path', schema: {}, required: true },
    { name: 'q', in: 'querystring', schema: {} },
    ...['style', 'explode', 'allowReserved'].map((key) => ({
      name: 'q',
      in: 'querystring',
      content: { 'text/plain': {} },
      [key]: true,
    })),
  ])('parameter %j', (parameter) => {
    expect(() => operation({ parameters: [parameter] })).toThrow(TypeError);
  });
  test.each([
    { contentType: 1 },
    { style: true },
    { style: 'matrix' },
    { explode: 1 },
    { allowReserved: 1 },
    { style: 'pipeDelimited', explode: true },
  ])('encoding %j', (encoding) => {
    expect(() =>
      operation({
        requestBody: { content: { 'multipart/form-data': { encoding: { field: encoding } } } },
      }),
    ).toThrow(TypeError);
  });
  test('duplicate, missing and malformed parameters', () => {
    const parameter = { name: 'q', in: 'query', schema: {} };
    expect(() => operation({ parameters: [parameter, parameter] })).toThrow(/Duplicate/);
    expect(() => operation({ parameters: {} })).toThrow(/array/);
    expect(() =>
      compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/{id}': { get: {} } } }),
    ).toThrow(/missing parameter/);
    expect(() =>
      operation({
        parameters: ['a', 'b'].map((name) => ({
          name,
          in: 'querystring',
          content: { 'text/plain': {} },
        })),
      }),
    ).toThrow(/at most one/);
    expect(() =>
      operation({
        requestBody: {
          content: {
            'multipart/form-data': { schema: { properties: { a: {} } }, encoding: { b: {} } },
          },
        },
      }),
    ).toThrow(/not a request-body schema property/);
  });
  test('missing and circular references', () => {
    expect(() => operation({ parameters: [{ $ref: '#/missing' }] })).toThrow(/Unresolvable/);
    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.1.0',
        components: { parameters: { q: { $ref: '#/components/parameters/q' } } },
        paths: { '/x': { get: { parameters: [{ $ref: '#/components/parameters/q' }] } } },
      }),
    ).toThrow(/Circular/);
  });
});

test.each(['3.0.3', '3.1.0', '3.2.1'])('schema content defaults for OpenAPI %s', (openapi) => {
  const schema = {
    allOf: [
      {
        properties: {
          primitive: { type: ['null', 'string'] },
          number: { type: 'number' },
          boolean: { type: 'boolean' },
          object: { allOf: [{ type: 'object' }] },
          array: { allOf: [{ type: 'array' }] },
          binary: { allOf: [{ type: 'string', format: 'binary', contentEncoding: 'base64' }] },
          composed: { allOf: [{ type: 'integer' }] },
          unknown: { allOf: [{}] },
          raw: false,
          list: { type: 'array', items: { type: 'string' } },
          encodedList: { type: 'array', items: { contentEncoding: 'base64' } },
        },
      },
    ],
  };
  const metadata = compileOpenAPIMetadata({
    openapi,
    paths: { '/x': { post: { requestBody: { content: { 'multipart/form-data': { schema } } } } } },
  });
  const media = metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data'];
  expect(media?.propertyKinds).toMatchObject({
    primitive: 'primitive',
    number: 'primitive',
    object: 'object',
    array: 'array',
    binary: 'binary',
    composed: 'primitive',
    unknown: 'unknown',
    raw: 'unknown',
  });
  expect(media?.propertyContentTypes).toMatchObject({
    primitive: 'text/plain',
    number: 'text/plain',
    boolean: 'text/plain',
    raw: 'application/octet-stream',
    list: 'text/plain',
  });
  expect(media?.requiresCustomSerializer).toContain('Content-Transfer-Encoding');
});

test.each(['prefixEncoding', 'itemEncoding', 'encoding'])(
  'marks advanced part %s for explicit serialization',
  (key) => {
    const metadata = operation({
      requestBody: {
        content: {
          'multipart/form-data': {
            encoding: { field: { contentType: 'multipart/mixed', [key]: {} } },
          },
        },
      },
    });
    expect(
      metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data']
        ?.requiresCustomSerializer,
    ).toContain(key);
  },
);

test('empty paths, empty body metadata and escaped reference tokens', () => {
  expect(compileOpenAPIMetadata({ openapi: '3.1.0' }).operations).toEqual({});
  expect(
    operation({ requestBody: { required: true, content: {} } }).operations['/x']?.post?.requestBody,
  ).toEqual({ mediaTypes: [], required: true });
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.0',
    components: { parameters: { 'a/b~c': { name: 'q', in: 'query', schema: {} } } },
    paths: { '/x': { get: { parameters: [{ $ref: '#/components/parameters/a~1b~0c' }] } } },
  });
  expect(metadata.operations['/x']?.get?.parameters?.query?.q?.name).toBe('q');
});
