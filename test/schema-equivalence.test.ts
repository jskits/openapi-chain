import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

type Schema = Record<string, unknown>;
type Client = {
  upload: { post(input: { body: unknown; contentType: string }): Promise<unknown> };
};

const bases: [name: string, schema: Schema, value: unknown, versions?: string[]][] = [
  ['string', { type: 'string' }, 'hello'],
  ['integer', { type: 'integer' }, 5],
  ['encoded string', { type: 'string', contentEncoding: 'base64' }, 'aGVsbG8=', ['3.1.1', '3.2.0']],
  ['binary string', { type: 'string', format: 'binary' }, 'hello', ['3.0.4']],
  ['object', { type: 'object', properties: { a: { type: 'integer' } } }, { a: 1 }],
  ['string array', { type: 'array', items: { type: 'string' } }, ['a', 'b']],
  ['object array', { type: 'array', items: { type: 'object' } }, [{ a: 1 }, { a: 2 }]],
  [
    'encoded array',
    { type: 'array', items: { type: 'string', contentEncoding: 'base64' } },
    ['aGVsbG8='],
    ['3.1.1', '3.2.0'],
  ],
  [
    'nested array',
    { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
    [
      [1, 2],
      [3, 4],
    ],
    ['3.2.0'],
  ],
];

// Spellings that must not change the wire representation of a property.
function variants(schema: Schema): [string, Schema, Schema?][] {
  const result: [string, Schema, Schema?][] = [
    ['inline', schema],
    ['$ref', { $ref: '#/components/schemas/Base' }, schema],
    ['allOf', { allOf: [schema] }],
    ['allOf + annotation', { allOf: [schema, { description: 'neutral' }] }],
    ['annotation + allOf', { allOf: [{ title: 'neutral' }, schema] }],
    ['sibling neutral allOf', { ...schema, allOf: [{ description: 'neutral' }] }],
    ['nested allOf $ref', { allOf: [{ allOf: [{ $ref: '#/components/schemas/Base' }] }] }, schema],
  ];
  const keywords = Object.entries(schema).map(([key, value]) => ({ [key]: value }));
  if (keywords.length > 1) {
    result.push(
      ['every keyword in allOf', { allOf: keywords }],
      ['every keyword in reversed allOf', { allOf: [...keywords].reverse() }],
    );
  }
  if ('items' in schema) {
    const { items, ...rest } = schema;
    result.push(
      ['items in allOf', { ...rest, allOf: [{ items }] }],
      ['items in later allOf', { ...rest, allOf: [{ minItems: 0 }, { items }] }],
      ['type and items split', { allOf: [{ items }, rest] }],
      [
        'items via $ref',
        { ...rest, items: { $ref: '#/components/schemas/Base' } },
        items as Schema,
      ],
    );
  }
  return result;
}

async function outcome(
  version: string,
  type: string,
  property: Schema,
  component: Schema | undefined,
  value: unknown,
): Promise<unknown> {
  let metadata;
  try {
    metadata = compileOpenAPIMetadata({
      openapi: version,
      components: { schemas: component ? { Base: component } : {} },
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                [type]: { schema: { type: 'object', properties: { value: property } } },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    return { compile: String(error) };
  }
  const media = metadata.operations['/upload']?.post?.requestBody?.media?.[type];
  const plan = {
    kind: media?.propertyKinds?.value,
    contentType: media?.propertyContentTypes?.value,
  };
  const api = createStrictClient({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      const wire: unknown[] = [];
      if (type === 'multipart/form-data') {
        for (const part of (await request.formData()).getAll('value')) {
          wire.push(typeof part === 'string' ? part : [part.type, part.name, await part.text()]);
        }
      } else {
        wire.push(await request.text());
      }
      return Response.json(wire);
    },
  }) as unknown as Client;
  try {
    return { plan, wire: await api.upload.post({ contentType: type, body: { value } }) };
  } catch (error) {
    return { plan, request: String(error) };
  }
}

const media = ['multipart/form-data', 'application/x-www-form-urlencoded'];
const cases = bases.flatMap(([name, schema, value, versions = ['3.0.4', '3.1.1', '3.2.0']]) =>
  versions.flatMap((version) => media.map((type) => [name, version, type, schema, value] as const)),
);

test.each(cases)(
  '%s properties keep one wire outcome across schema spellings (%s, %s)',
  async (_name, version, type, schema, value) => {
    const expected = await outcome(version, type, schema, undefined, value);
    for (const [spelling, property, component] of variants(schema)) {
      expect({
        spelling,
        outcome: await outcome(version, type, property, component, value),
      }).toEqual({ spelling, outcome: expected });
    }
  },
);
