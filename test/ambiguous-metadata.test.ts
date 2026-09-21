import { expect, test, vi } from 'vitest';
import { compileOpenAPIMetadata, type CompileOpenAPIMetadataOptions } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
import type { Transport } from '../src/index.js';

type Operation = { responses: { 204: { content?: never } } };
type Paths = {
  '/x/{id}': { parameters: { path: { id: string } }; get: Operation };
  '/x/{name}': { parameters: { path: { name: string } }; get: Operation; delete: Operation };
  '/ok': { get: Operation };
};
const operation = (name: string, style = 'simple') => ({
  parameters: [{ name, in: 'path', required: true, style, schema: { type: 'string' } }],
  responses: { 204: { description: 'ok' } },
});
const document = {
  openapi: '3.1.0',
  paths: {
    '/x/{id}': { get: operation('id') },
    '/x/{name}': { get: operation('name', 'label'), delete: operation('name', 'label') },
    '/ok': { get: {} },
  },
};

test('duplicate hierarchy rejection remains the default and validates the option', () => {
  for (const options of [undefined, { onAmbiguousTemplate: 'throw' } as const])
    expect(() => compileOpenAPIMetadata(document, options)).toThrow(/onAmbiguousTemplate/);
  expect(() =>
    compileOpenAPIMetadata(document, {
      onAmbiguousTemplate: 'typo',
    } as unknown as CompileOpenAPIMetadataOptions),
  ).toThrow(/Invalid/);
});

test('allow retains precise template rules, method routing and fail-closed ambiguous calls', async () => {
  const metadata = compileOpenAPIMetadata(document, { onAmbiguousTemplate: 'allow' });
  expect(metadata.complete).toBe(true);
  expect(Object.keys(metadata.operations)).toEqual(Object.keys(document.paths));
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata, transport });
  await api.ok.get();
  await api.x('abc').delete();
  await api.$path('/x/{id}', { id: 'abc' }).get();
  await api.$path('/x/{name}', { name: 'abc' }).get();
  expect(transport.mock.calls.map(([r]) => [r.method, r.url])).toEqual([
    ['get', 'https://api.test/ok'],
    ['delete', 'https://api.test/x/.abc'],
    ['get', 'https://api.test/x/abc'],
    ['get', 'https://api.test/x/.abc'],
  ]);
  await expect(api.x('abc').get()).rejects.toThrow(/Ambiguous/);
  expect(transport).toHaveBeenCalledTimes(4);
});

test('allow does not suppress missing parameter or reference errors', () => {
  expect(() =>
    compileOpenAPIMetadata(
      { openapi: '3.1.0', paths: { '/x/{id}': { get: {} } } },
      { onAmbiguousTemplate: 'allow' },
    ),
  ).toThrow(/missing parameter/);
  expect(() =>
    compileOpenAPIMetadata(
      { openapi: '3.1.0', paths: { '/x': { $ref: './external.json' } } },
      { onAmbiguousTemplate: 'allow' },
    ),
  ).toThrow(/reference/i);
});
