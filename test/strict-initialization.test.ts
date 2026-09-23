import { expect, test, vi } from 'vitest';
import { createStrictClient, type StrictClientOptions } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import type { Transport } from '../packages/core/src/index.js';

test.each([
  undefined,
  null,
  [],
  {},
  { version: 2, complete: true, operations: {} },
  { version: 1, operations: {} },
  { version: 1, complete: false, operations: {} },
  { version: 1, complete: true, operations: [] },
  { version: 1, complete: true, operations: { '/x': null } },
  { version: 1, complete: true, operations: { '/x': { get: [] } } },
  { version: 1, complete: true, operations: { '/x': { foo: {} } } },
  { version: 1, complete: true, operations: { x: { get: {} } } },
])('strict rejects absent, partial or malformed artifact at construction: %j', (metadata) => {
  const transport = vi.fn<Transport>();
  const headers = vi.fn<() => HeadersInit>(() => ({}));
  expect(() =>
    createStrictClient({
      baseUrl: 'https://api.test',
      transport,
      headers,
      metadata,
    } as unknown as StrictClientOptions),
  ).toThrow(/metadata/);
  expect(transport).not.toHaveBeenCalled();
  expect(headers).not.toHaveBeenCalled();
});

test('JSON-decoded compiler output and empty complete scopes are valid artifacts', async () => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/x': { get: {} } } });
  const api = createStrictClient<{ '/x': { get: { responses: { 204: { content: never } } } } }>({
    baseUrl: 'https://api.test',
    metadata: JSON.parse(JSON.stringify(metadata)),
    transport,
  });
  await api.x.get();
  expect(transport).toHaveBeenCalledOnce();
  const empty = createStrictClient({
    baseUrl: 'https://api.test',
    metadata: compileOpenAPIMetadata({ openapi: '3.1.0', paths: {} }),
    transport,
  });
  // @ts-expect-error untyped JavaScript callers cannot bypass a complete empty scope
  await expect(empty.x.get()).rejects.toThrow(/does not match/);
  expect(transport).toHaveBeenCalledOnce();
});
