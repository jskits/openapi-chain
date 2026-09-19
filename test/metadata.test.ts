import { describe, expect, test } from 'vitest';
import { compileOpenAPIMetadata, defineOpenAPIMetadata } from '../src/metadata.js';

describe('compileOpenAPIMetadata', () => {
  test('resolves local refs and operation parameters override path parameters', () => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.1.0',
      components: {
        parameters: {
          Id: {
            name: 'id',
            in: 'path',
            required: true,
            style: 'simple',
            schema: { type: 'string' },
          },
        },
      },
      paths: {
        '/x/{id}': {
          parameters: [{ $ref: '#/components/parameters/Id' }],
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                style: 'label',
                schema: { type: 'string' },
              },
            ],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    });

    expect(metadata.complete).toBe(true);
    expect(metadata.operations['/x/{id}']?.get?.parameters?.path?.id).toMatchObject({
      style: 'label',
      explode: false,
    });
  });

  test('collects request-body media types, encodings and property kinds', () => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      meta: { type: 'object' },
                      file: { type: 'string', contentEncoding: 'base64' },
                    },
                  },
                  encoding: { meta: { contentType: 'application/json' } },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    const request = metadata.operations['/upload']?.post?.requestBody;
    expect(request?.mediaTypes).toEqual(['multipart/form-data']);
    expect(request?.media?.['multipart/form-data']?.propertyKinds).toEqual({
      meta: 'object',
      file: 'binary',
    });
    expect(request?.media?.['multipart/form-data']?.propertyContentTypes).toEqual({
      meta: 'application/json',
      file: 'application/octet-stream',
    });
    expect(request?.media?.['multipart/form-data']?.encoding?.meta?.contentType).toBe(
      'application/json',
    );
    expect(request?.media?.['multipart/form-data']?.requiresCustomSerializer).toContain(
      'Content-Transfer-Encoding',
    );
  });

  test('requires explicit serialization for multipart parts with multiple media choices', () => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.1',
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: { type: 'object', properties: { file: {} } },
                  encoding: { file: { contentType: 'image/png, image/jpeg' } },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    expect(
      metadata.operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']
        ?.requiresCustomSerializer,
    ).toContain('multiple contentType choices');
  });

  test('rejects external refs and invalid location/style combinations', () => {
    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: {
          '/x': {
            get: {
              parameters: [{ $ref: 'https://example.test/parameter.json' }],
            },
          },
        },
      }),
    ).toThrow('External OpenAPI $ref');

    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: {
          '/x': {
            get: {
              parameters: [
                {
                  name: 'x',
                  in: 'header',
                  style: 'deepObject',
                  schema: { type: 'object' },
                },
              ],
            },
          },
        },
      }),
    ).toThrow('Invalid OpenAPI style');
  });

  test('supports OpenAPI 3.2 QUERY, querystring and cookie style metadata', () => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.1',
      paths: {
        '/search': {
          query: {
            parameters: [
              {
                name: 'all',
                in: 'querystring',
                content: {
                  'application/x-www-form-urlencoded': {
                    schema: {
                      type: 'object',
                      properties: { q: { type: 'string' } },
                    },
                  },
                },
              },
              {
                name: 'session',
                in: 'cookie',
                style: 'cookie',
                explode: true,
                schema: { type: 'string' },
              },
            ],
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    const operation = metadata.operations['/search']?.query;
    expect(operation?.parameters?.querystring?.all?.contentType).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(operation?.parameters?.cookie?.session?.style).toBe('cookie');
  });

  test('fails closed on invalid 3.2 querystring combinations and arbitrary additionalOperations', () => {
    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.1.2',
        paths: {
          '/x': {
            get: {
              parameters: [
                {
                  name: 'all',
                  in: 'querystring',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              ],
            },
          },
        },
      }),
    ).toThrow('requires OpenAPI 3.2');

    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.2.1',
        paths: {
          '/x': {
            get: {
              parameters: [
                { name: 'q', in: 'query', schema: { type: 'string' } },
                {
                  name: 'all',
                  in: 'querystring',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              ],
            },
          },
        },
      }),
    ).toThrow('cannot mix query and querystring');

    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.2.1',
        paths: {
          '/x': { additionalOperations: { PURGE: { responses: {} } } },
        },
      }),
    ).toThrow('additionalOperations');
  });

  test('applies OpenAPI 3.2 header and cookie edge rules', () => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.1',
      paths: {
        '/x': {
          parameters: [
            { name: 'X-Mode', in: 'header', schema: { type: 'string' } },
            { name: 'Authorization', in: 'header', schema: { type: 'string' } },
          ],
          get: {
            parameters: [
              { name: 'x-mode', in: 'header', required: true, schema: { type: 'string' } },
            ],
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    const headers = metadata.operations['/x']?.get?.parameters?.header;
    expect(Object.keys(headers ?? {})).toEqual(['x-mode']);
    expect(headers?.['x-mode']?.required).toBe(true);

    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.2.1',
        paths: {
          '/cookie': {
            get: {
              parameters: [
                {
                  name: 'prefs',
                  in: 'cookie',
                  style: 'form',
                  explode: false,
                  schema: { type: 'array', items: { type: 'string' } },
                },
              ],
              responses: { 204: { description: 'ok' } },
            },
          },
        },
      }),
    ).toThrow('requires explode=true');
  });

  test('rejects ambiguous templated paths and unsupported OpenAPI versions', () => {
    expect(() =>
      compileOpenAPIMetadata({
        openapi: '3.2.1',
        paths: {
          '/pets/{id}': {},
          '/pets/{name}': {},
        },
      }),
    ).toThrow('same templated hierarchy');

    expect(() => compileOpenAPIMetadata({ openapi: '2.0', paths: {} })).toThrow(
      'supports OpenAPI 3.0, 3.1, and 3.2',
    );
  });

  test('supports explicit partial metadata without marking it complete', () => {
    const partial = defineOpenAPIMetadata({ version: 1, operations: {} });
    expect(partial.complete).toBeUndefined();
  });
});
