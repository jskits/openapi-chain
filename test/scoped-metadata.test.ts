import { expect, test } from 'vitest';
import {
  compileOpenAPIMetadata,
  type CompileOpenAPIMetadataOptions,
} from '../packages/core/src/metadata.js';
import { createOperationResolver } from '../packages/core/src/routes.js';

const document = {
  openapi: '3.1.0',
  paths: {
    '/items': { get: { parameters: [{ $ref: '#/paths/~1source/get/parameters/0' }] } },
    '/source': { get: { parameters: [{ $ref: '#/components/parameters/filter' }] } },
    '/unrelated': { $ref: 'external.json' },
  },
  components: {
    parameters: {
      filter: {
        name: 'filter',
        in: 'query',
        style: 'deepObject',
        explode: true,
        schema: { type: 'object' },
      },
    },
  },
};

test('scope preserves cross-path and component reference context without compiling unrelated paths', () => {
  const original = structuredClone(document);
  const metadata = compileOpenAPIMetadata(document, { paths: ['/items'] });
  expect(metadata.complete).toBe(true);
  expect(Object.keys(metadata.operations)).toEqual(['/items']);
  expect(metadata.operations['/items']?.get?.parameters?.query?.filter?.style).toBe('deepObject');
  expect(document).toEqual(original);
  const resolve = createOperationResolver(metadata);
  expect(() =>
    resolve({ kind: 'template', template: '/source', params: undefined }, 'get'),
  ).toThrow(/does not contain/);
  expect(() =>
    resolve({ kind: 'chain', segments: [{ kind: 'static', value: 'source' }] }, 'get'),
  ).toThrow(/does not match/);
});

test('empty scope is complete and duplicates are deduplicated in document order', () => {
  expect(compileOpenAPIMetadata(document, { paths: [] })).toMatchObject({
    complete: true,
    operations: {},
  });
  expect(
    Object.keys(
      compileOpenAPIMetadata(document, { paths: ['/source', '/items', '/items'] }).operations,
    ),
  ).toEqual(['/items', '/source']);
});

test.each([['/typo'], ['toString'], [null], '/items'])(
  'scope rejects invalid selections: %j',
  (paths) => {
    expect(() =>
      compileOpenAPIMetadata(document, { paths } as unknown as CompileOpenAPIMetadataOptions),
    ).toThrow(/path/i);
  },
);

test('selected references and selected ambiguity still fail under default rules', () => {
  expect(() => compileOpenAPIMetadata(document, { paths: ['/unrelated'] })).toThrow(/reference/i);
  const operation = (name: string) => ({
    parameters: [{ name, in: 'path', required: true, schema: { type: 'string' } }],
  });
  const ambiguous = {
    openapi: '3.1.0',
    paths: { '/x/{a}': { get: operation('a') }, '/x/{b}': { get: operation('b') } },
  };
  expect(() => compileOpenAPIMetadata(ambiguous, { paths: ['/x/{a}', '/x/{b}'] })).toThrow(
    /hierarchy/,
  );
  expect(Object.keys(compileOpenAPIMetadata(ambiguous, { paths: ['/x/{a}'] }).operations)).toEqual([
    '/x/{a}',
  ]);
  expect(
    Object.keys(
      compileOpenAPIMetadata(ambiguous, {
        paths: ['/x/{a}', '/x/{b}'],
        onAmbiguousTemplate: 'allow',
      }).operations,
    ),
  ).toHaveLength(2);
});
