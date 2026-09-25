import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
};
function compile(property: unknown, openapi = '3.1.1') {
  return compileOpenAPIMetadata({
    openapi,
    components: { schemas: { Text: { type: 'string' } } },
    paths: {
      '/upload': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { value: property } },
              },
            },
          },
        },
      },
    },
  });
}

test.each(['3.0.4', '3.1.1', '3.2.1'])(
  'equivalent composed strings retain text multipart parts in %s',
  async (version) => {
    for (const schema of [
      { type: 'string' },
      { type: 'string', allOf: [{ minLength: 1 }] },
      { allOf: [{ type: 'string' }, { minLength: 1 }] },
      { allOf: [{ allOf: [{ $ref: '#/components/schemas/Text' }] }, { maxLength: 20 }] },
    ]) {
      const api = createStrictClient<Paths>({
        baseUrl: 'https://example.test',
        metadata: compile(schema, version),
        transport: async ({ url, init }) => {
          const request = new Request(url, init);
          const wire = await request.clone().text();
          expect(wire).not.toContain('filename=');
          expect(wire).not.toContain('application/json');
          expect((await request.formData()).get('value')).toBe('hello');
          return new Response(null, { status: 204 });
        },
      });
      await api.upload.post({ body: { value: 'hello' } });
    }
  },
);

test.each([
  [{ allOf: [{ type: 'integer' }, { minimum: 0 }] }, 'text/plain'],
  [{ allOf: [{ type: 'boolean' }] }, 'text/plain'],
  [{ allOf: [{ type: 'object' }, { properties: {} }] }, 'application/json'],
  [{ allOf: [{ type: 'array', items: { type: 'string' } }] }, 'text/plain'],
  [{ allOf: [{ type: 'string', contentEncoding: 'base64' }] }, 'application/octet-stream'],
  [{ allOf: [{}] }, 'application/octet-stream'],
])('infers composed defaults without assuming an object: %j', (schema, expected) => {
  expect(
    compile(schema).operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']
      ?.propertyContentTypes?.value,
  ).toBe(expected);
});

test('rejects incompatible inferred composition instead of selecting a wire format', () => {
  expect(() => compile({ allOf: [{ type: 'object' }, { type: 'string' }] })).toThrow(
    /Conflicting allOf/,
  );
});

test('a neutral allOf does not hide contentEncoding on sibling items', async () => {
  const items = { type: 'string', contentEncoding: 'base64' };
  for (const schema of [
    { type: 'array', items },
    { type: 'array', items, allOf: [{ minItems: 1 }] },
    { type: 'array', allOf: [{ minItems: 1 }, { items }] },
  ]) {
    const metadata = compile(schema);
    expect(
      metadata.operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']
        ?.requiresCustomSerializer,
    ).toMatch(/contentEncoding/);
    let sent = false;
    const api = createStrictClient<Paths>({
      baseUrl: 'https://example.test',
      metadata,
      transport: async () => {
        sent = true;
        return new Response(null, { status: 204 });
      },
    });
    await expect(
      api.upload.post({ body: { value: ['aGVsbG8='] as unknown as string } }),
    ).rejects.toThrow(/contentEncoding/);
    expect(sent).toBe(false);
  }
});
