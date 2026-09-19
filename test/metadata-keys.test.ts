import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';

test.each(['__proto__', 'constructor', 'toString'])(
  'preserves required parameter %s as an own key',
  async (name) => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/x': {
          get: { parameters: [{ name, in: 'query', required: true, schema: { type: 'string' } }] },
        },
      },
    });
    expect(Object.keys(metadata.operations['/x']?.get?.parameters?.query ?? {})).toEqual([name]);
    type Paths = {
      '/x': {
        get: {
          parameters: { query?: Record<string, string> };
          responses: { 204: { content: never } };
        };
      };
    };
    let calls = 0;
    const api = createStrictClient<Paths>({
      baseUrl: 'https://example.test',
      metadata,
      transport: async (request) => {
        expect(new URL(request.url).searchParams.get(name)).toBe('value');
        calls++;
        return new Response(null, { status: 204 });
      },
    });
    await expect(api.x.get()).rejects.toThrow(/Missing required/);
    await api.x.get({ query: { [name]: 'value' } });
    expect(calls).toBe(1);
  },
);
test('preserves special schema property and encoding names', () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.0',
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { properties: { ['__proto__']: { type: 'object' } } },
                encoding: { ['__proto__']: { contentType: 'application/json' } },
              },
            },
          },
        },
      },
    },
  });
  const media = metadata.operations['/x']?.post?.requestBody?.media?.['multipart/form-data'];
  expect(Object.keys(media?.propertyKinds ?? {})).toEqual(['__proto__']);
  expect(media?.encoding?.['__proto__']?.contentType).toBe('application/json');
});
test('JSON pointers traverse own array elements but never inherited properties', () => {
  const parameter = { name: 'q', in: 'query', schema: { type: 'string' } };
  const document = {
    openapi: '3.1.0',
    components: { examples: [parameter] },
    paths: { '/x': { get: { parameters: [{ $ref: '#/components/examples/0' }] } } },
  };
  expect(compileOpenAPIMetadata(document).operations['/x']?.get?.parameters?.query?.q?.name).toBe(
    'q',
  );
  document.paths['/x'].get.parameters[0] = { $ref: '#/constructor/prototype' };
  expect(() => compileOpenAPIMetadata(document)).toThrow(/Unresolvable/);
});
