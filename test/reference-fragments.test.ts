import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

const parameter = { name: 'q', in: 'query', required: true, schema: { type: 'string' } };
function compile(ref: string, fixtures: unknown = {}) {
  return compileOpenAPIMetadata({
    openapi: '3.1.1',
    info: { title: 'Reference fragment fixture', version: '1' },
    components: { parameters: { Q: parameter } },
    'x-fixtures': fixtures,
    paths: {
      '/ok': { get: { parameters: [{ $ref: ref }], responses: { 204: { description: 'OK' } } } },
    },
  });
}

test.each([
  '#/components/parameters/Q',
  '#/components/parameters/%51',
  '#%2Fcomponents%2Fparameters%2FQ',
])('decodes URI fragments before pointer evaluation: %s', (ref) => {
  expect(compile(ref)).toEqual(compile('#/components/parameters/Q'));
});

test.each([
  ['#/x-fixtures/a~1b', { 'a/b': parameter }],
  ['#/x-fixtures/a%2Fb', { a: { b: parameter } }],
  ['#/x-fixtures/%E4%B8%AD%E6%96%87', { 中文: parameter }],
  ['#/x-fixtures/%25', { '%': parameter }],
  ['#/x-fixtures/%257E1', { '%7E1': parameter }],
  ['#/x-fixtures/%7E01', { '~1': parameter }],
  ['#/x-fixtures/%20', { ' ': parameter }],
  ['#/x-fixtures/0', [parameter]],
] as const)('preserves the two distinct escaping layers: %s', (ref, fixtures) => {
  expect(compile(ref, fixtures)).toEqual(compile('#/components/parameters/Q'));
});

test.each([
  ['#/x-fixtures/%', /Invalid URI encoding/],
  ['#/x-fixtures/%FF', /Invalid URI encoding/],
  ['#/x-fixtures/~2', /Invalid JSON Pointer escape/],
  ['#/x-fixtures/~', /Invalid JSON Pointer escape/],
  ['#anchor', /Unsupported local/],
  ['https://example.test/schema.json#/Q', /External OpenAPI/],
] as const)('fails explicitly on unsupported or malformed reference %s', (ref, message) => {
  expect(() => compile(ref)).toThrow(message);
});

test.each(['01', '-1', '-', 'length'])('rejects non-index array tokens: %s', (token) => {
  expect(() => compile(`#/x-fixtures/${token}`, [parameter])).toThrow(/array index/);
});
