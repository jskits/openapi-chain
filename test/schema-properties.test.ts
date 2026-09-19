import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': { value: unknown } } };
      responses: { 204: { content: never } };
    };
  };
};
const cases = [
  {
    name: 'text',
    schema: { type: 'string' },
    value: '中文😀',
    parts: [{ kind: 'text', value: '中文😀' }],
  },
  {
    name: 'number',
    schema: { type: 'integer' },
    value: 42,
    parts: [{ kind: 'text', value: '42' }],
  },
  {
    name: 'boolean',
    schema: { type: 'boolean' },
    value: false,
    parts: [{ kind: 'text', value: 'false' }],
  },
  {
    name: 'array',
    schema: { type: 'array', items: { type: 'string' } },
    value: ['a', 'b'],
    parts: [
      { kind: 'text', value: 'a' },
      { kind: 'text', value: 'b' },
    ],
  },
  {
    name: 'object',
    schema: { type: 'object', properties: { name: { type: 'string' } } },
    value: { name: 'Ada' },
    parts: [{ kind: 'file', type: 'application/json', value: '{"name":"Ada"}' }],
  },
];

for (const openapi of ['3.0.4', '3.1.1', '3.2.1']) {
  test.each(cases)(
    'wire invariance under inlining, composition and declaration widening: ' + openapi + ' $name',
    async ({ schema, value, parts }) => {
      const base = { type: 'object', properties: { value: schema } };
      const annotation = {
        properties: { value: { description: 'constraint-neutral annotation' } },
      };
      const variants = [
        base,
        {
          properties: {
            value: {
              $ref: '#/components/schemas/Leaf',
              allOf: [{ $ref: '#/components/schemas/Leaf', description: 'repeated leaf' }],
            },
          },
        },
        { $ref: '#/components/schemas/Base', allOf: [{ $ref: '#/components/schemas/Base' }] },
        { $ref: '#/components/schemas/Base' },
        { allOf: [base, annotation] },
        { allOf: [annotation, base] },
        {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            annotation,
            { $ref: '#/components/schemas/Base' },
          ],
        },
        { allOf: [{ allOf: [annotation] }, base] },
      ];
      for (const variant of variants)
        for (const widen of [false, true]) {
          const content = {
            ...(widen
              ? { '*/*': { encoding: { value: { contentType: 'application/x-unrelated' } } } }
              : {}),
            'multipart/form-data': { schema: variant },
          };
          const metadata = compileOpenAPIMetadata({
            openapi,
            components: { schemas: { Base: base, Leaf: schema } },
            paths: { '/upload': { post: { requestBody: { content } } } },
          });
          const api = createStrictClient<Paths>({
            baseUrl: 'https://example.test',
            metadata,
            transport: async ({ url, init }) => {
              const form = await new Request(url, init).formData();
              const actual = await Promise.all(
                form
                  .getAll('value')
                  .map(async (part) =>
                    typeof part === 'string'
                      ? { kind: 'text', value: part }
                      : { kind: 'file', type: part.type, value: await part.text() },
                  ),
              );
              expect(actual).toEqual(parts);
              return new Response(null, { status: 204 });
            },
          });
          await api.upload.post({ contentType: 'multipart/form-data', body: { value } });
        }
    },
  );
}
