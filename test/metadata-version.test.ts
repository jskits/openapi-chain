import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

test.each(['3.1.foo', '3.1.', '3.1', '3.2.foo', '3.1.0junk', '3.1.01'])(
  'rejects malformed version %s',
  (openapi) => {
    expect(() => compileOpenAPIMetadata({ openapi, paths: {} })).toThrow(/supports OpenAPI/);
  },
);
test.each(['3.0.4', '3.1.2'])('rejects QUERY in %s', (openapi) => {
  expect(() => compileOpenAPIMetadata({ openapi, paths: { '/x': { query: {} } } })).toThrow(
    /QUERY.*requires OpenAPI 3.2/,
  );
});
test.each(['3.0.99', '3.1.123', '3.2.0'])(
  'accepts patch versions within supported minor %s',
  (openapi) => {
    expect(compileOpenAPIMetadata({ openapi, paths: { '/x': { get: {} } } }).complete).toBe(true);
  },
);
