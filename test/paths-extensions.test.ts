import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

test.each(['3.0.4', '3.1.1', '3.2.1'])(
  'ignores Paths specification extensions in %s',
  (openapi) => {
    const operation = { get: { responses: { 204: { description: 'OK' } } } };
    const compile = (paths: unknown) => compileOpenAPIMetadata({ openapi, paths });
    const expected = compile({ '/ok': operation });
    for (const value of [
      'summary',
      42,
      true,
      null,
      ['a'],
      { get: 'not an operation', $ref: 'external.json' },
    ]) {
      expect(compile({ 'x-summary': value, '/ok': operation })).toEqual(expected);
    }
    expect(compile({ 'x-only': null }).operations).toEqual({});
    expect(compile({ '/x-summary': operation }).operations['/x-summary']).toEqual({ get: {} });
  },
);

test.each(['pets', 'X-extension', ''])(
  'rejects non-extension keys that are not paths: %j',
  (path) => {
    expect(() => compileOpenAPIMetadata({ openapi: '3.1.1', paths: { [path]: {} } })).toThrow(
      /path must begin with/,
    );
  },
);
