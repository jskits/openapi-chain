import { expect, test } from 'vitest';
import { createClient, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { mergeHeaders } from '../packages/core/src/headers.js';

type Paths = {
  '/items': { get: { responses: { 204: { content: never } } } };
};
const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/items': { get: {} } } });

/** The replaced implementation: construct Headers, then overwrite each resulting field. */
function reference(target: Headers, value: HeadersInit) {
  new Headers(value).forEach((entry, name) => target.set(name, entry));
}
const merged = (merge: typeof mergeHeaders, value: HeadersInit) => {
  const target = new Headers({ 'x-default': 'base', 'x-keep': 'kept' });
  merge(target, value);
  return [...target];
};

test.each<[string, HeadersInit]>([
  ['plain record', { 'X-Default': 'override', 'x-new': 'value' }],
  ['coerced record values', { 'x-number': 1 as unknown as string }],
  ['case-insensitive duplicate keys', { 'X-Dup': 'a', 'x-dup': 'b', 'x-default': 'c' }],
  ['null-prototype record', Object.assign(Object.create(null) as object, { 'x-null': 'proto' })],
  [
    'pair array',
    [
      ['x-default', 'a'],
      ['x-default', 'b'],
    ],
  ],
  ['Headers instance', new Headers({ 'x-default': 'instance' })],
  ['empty record', {}],
])('header merge matches Headers constructor semantics: %s', (_label, value) => {
  expect(merged(mergeHeaders, value)).toEqual(merged(reference, value));
});

test('header merge keeps Headers constructor rejections', () => {
  for (const value of [
    { 'bad name': 'x' },
    { 'x-bad': 'line\nbreak' },
    { [Symbol('x')]: 'symbol' } as unknown as HeadersInit,
  ]) {
    expect(() => merged(reference, value)).toThrow(TypeError);
    expect(() => merged(mergeHeaders, value)).toThrow(TypeError);
  }
});

test.each([false, true])(
  'client defaults, extensions and init headers keep precedence, strict=%s',
  async (strict) => {
    const seen: Headers[] = [];
    const transport: Transport = async ({ init }) => {
      seen.push(new Headers(init.headers));
      return new Response(null, { status: 204 });
    };
    const options = { baseUrl: 'https://example.test', transport, headers: { 'x-a': 'client' } };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    await api.items.get({ init: { headers: { 'X-A': 'init', 'x-b': 'init' } } });
    await api.items.get({ init: { headers: { 'x-b': 'first', 'X-B': 'second' } } });
    expect([...seen[0]!]).toEqual([
      ['x-a', 'init'],
      ['x-b', 'init'],
    ]);
    expect([...seen[1]!]).toEqual([
      ['x-a', 'client'],
      ['x-b', 'first, second'],
    ]);
  },
);
