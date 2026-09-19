import { expect, test } from 'vitest';
import { createOperationResolver } from '../src/routes.js';
import type { OpenAPIMetadata } from '../src/type.js';

test('indexes routes once and preserves method and dynamic/static distinctions', () => {
  let enumerations = 0;
  const operations = Object.fromEntries(
    Array.from({ length: 10_000 }, (_, i) => [`/r${i}/{id}`, { get: {} }]),
  );
  const resolver = createOperationResolver({
    version: 1,
    complete: true,
    operations: new Proxy(operations, {
      ownKeys: (target) => {
        enumerations++;
        return Reflect.ownKeys(target);
      },
    }),
  });
  for (let i = 0; i < 100; i++)
    expect(
      resolver(
        {
          kind: 'chain',
          segments: [
            { kind: 'static', value: 'r9999' },
            { kind: 'dynamic', value: i },
          ],
        },
        'get',
      ).template,
    ).toBe('/r9999/{id}');
  expect(enumerations).toBe(1);
  expect(() =>
    resolver(
      {
        kind: 'chain',
        segments: [
          { kind: 'static', value: 'r9999' },
          { kind: 'static', value: '1' },
        ],
      },
      'get',
    ),
  ).toThrow(/does not match/);
  expect(() =>
    resolver({ kind: 'template', template: '/r9999/{id}', params: { id: 1 } }, 'post'),
  ).toThrow(/does not contain/);
});
test('preserves ambiguity errors and partial metadata behavior', () => {
  const metadata: OpenAPIMetadata = {
    version: 1,
    operations: { '/{a}': { get: {} }, '/{b}': { get: {}, post: {} } },
  };
  const resolver = createOperationResolver(metadata);
  const state = { kind: 'chain', segments: [{ kind: 'dynamic', value: 'a' }] } as const;
  expect(() => resolver(state, 'get')).toThrow(/Ambiguous/);
  expect(resolver(state, 'post').template).toBe('/{b}');
  expect(resolver(state, 'delete')).toEqual({});
  expect(
    resolver({ kind: 'template', template: '/absent', params: undefined }, 'get').metadata,
  ).toBeUndefined();
  expect(createOperationResolver(undefined)(state, 'get')).toEqual({});
});
test('routing structure is snapshotted per client and includes root routes', () => {
  const metadata: OpenAPIMetadata = { version: 1, operations: { '/': { get: {} } } };
  const resolver = createOperationResolver(metadata);
  metadata.operations = {};
  expect(resolver({ kind: 'chain', segments: [] }, 'get').template).toBe('/');
  expect(resolver({ kind: 'template', template: '/', params: undefined }, 'get').metadata).toEqual(
    {},
  );
});
