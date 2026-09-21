import { expect, test, vi } from 'vitest';
import { createClient, type CoreClientOptions, type Transport } from '../src/index.js';

type Paths = { '/x': { get: { responses: { 204: { content?: never } } } } };

test.each([
  { middleware: [] },
  { middleware: null },
  { metadata: { version: 1, operations: {} } },
  { metadata: null },
  { headers: () => ({ authorization: 'secret' }) },
  { headers: async () => ({ authorization: 'secret' }) },
])('core rejects strict-only options before transport: %j', (extra) => {
  const transport = vi.fn<Transport>();
  expect(() =>
    createClient<Paths>({
      baseUrl: 'https://api.test',
      transport,
      ...extra,
    } as unknown as CoreClientOptions),
  ).toThrow('Use openapi-chain/strict.');
  expect(transport).not.toHaveBeenCalled();
});

test.each([
  new Headers({ authorization: 'token' }),
  { authorization: 'token' },
  [['authorization', 'token']] as [string, string][],
])('core retains static headers and permits omitted strict-only options', async (headers) => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  await createClient<Paths>({
    baseUrl: 'https://api.test',
    transport,
    headers,
    middleware: undefined,
    metadata: undefined,
  } as unknown as CoreClientOptions).x.get();
  expect(new Headers(transport.mock.calls[0]![0].init.headers).get('authorization')).toBe('token');
});
