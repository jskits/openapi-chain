import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
};
function compile(schema: unknown, version = '3.1.1') {
  return compileOpenAPIMetadata({
    openapi: version,
    components: { schemas: { Text: { type: 'string' } } },
    paths: {
      '/upload': { post: { requestBody: { content: { 'multipart/form-data': { schema } } } } },
    },
  });
}
const typed = { type: 'object', properties: { value: { $ref: '#/components/schemas/Text' } } };
const constrained = { type: 'object', properties: { value: { minLength: 1 } } };

test.each(['3.0.4', '3.1.1', '3.2.1'])(
  'property conjunction is invariant to allOf order in %s',
  async (version) => {
    const schemas = [
      { allOf: [typed, constrained] },
      { allOf: [constrained, typed] },
      { ...typed, allOf: [constrained] },
      { ...constrained, allOf: [typed] },
      { allOf: [{ allOf: [typed] }, constrained, typed] },
    ];
    const expected = compile(typed, version);
    for (const schema of schemas) {
      const metadata = compile(schema, version);
      expect(metadata).toEqual(expected);
      const api = createStrictClient<Paths>({
        baseUrl: 'https://example.test',
        metadata,
        transport: async ({ url, init }) => {
          const request = new Request(url, init);
          expect(await request.clone().text()).not.toContain('filename=');
          expect((await request.formData()).get('value')).toBe('hello');
          return new Response(null, { status: 204 });
        },
      });
      await api.upload.post({ body: { value: 'hello' } });
    }
  },
);

test('incompatible property wire representations fail in both orders', () => {
  const object = { properties: { value: { type: 'object' } } };
  for (const allOf of [
    [typed, object],
    [object, typed],
  ])
    expect(() => compile({ allOf })).toThrow(/Conflicting allOf/);
});

test('contentEncoding cannot be erased by a later property constraint', () => {
  const binary = { properties: { value: { type: 'string', contentEncoding: 'base64' } } };
  for (const allOf of [
    [binary, constrained],
    [constrained, binary],
  ]) {
    expect(
      compile({ allOf }).operations['/upload']?.post?.requestBody?.media?.['multipart/form-data']
        ?.requiresCustomSerializer,
    ).toMatch(/contentEncoding/);
  }
});
