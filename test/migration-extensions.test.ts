import { expect, test, vi } from 'vitest';
import { createClient, type RequestInput, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Runtime = { $path(path: string): { get(input?: RequestInput): Promise<unknown> } };
const metadata = compileOpenAPIMetadata({
  openapi: '3.2.0',
  paths: {
    '/optional': { get: { parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] } },
    '/required': {
      get: { parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] },
    },
    '/whole': {
      get: {
        parameters: [
          {
            name: 'all',
            in: 'querystring',
            content: { 'application/x-www-form-urlencoded': { schema: { type: 'object' } } },
          },
        ],
      },
    },
  },
});

test.each([false, true])('query callback survives core migration, strict=%s', async (strict) => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const options = { baseUrl: 'https://api.test', transport };
  const api = (strict
    ? createStrictClient({ ...options, metadata })
    : createClient(options)) as unknown as Runtime;
  const query = vi.fn<() => URLSearchParams>(() => new URLSearchParams('q=custom'));
  for (const value of [{}, { q: undefined }, { q: 'supplied' }]) {
    await api.$path('/optional').get({ query: value, extensions: { query } });
    expect(transport.mock.lastCall![0].url).toBe('https://api.test/optional?q=custom');
  }
  expect(query).toHaveBeenCalledTimes(3);
  await api.$path('/optional').get({ extensions: { query } });
  expect(query).toHaveBeenCalledTimes(3);
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/optional');
});

test('strict validates before empty-record extensions and preserves query exclusivity', async () => {
  const transport = vi.fn<Transport>();
  const query = vi.fn<() => string>(() => 'q=custom');
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    transport,
    metadata,
  }) as unknown as Runtime;
  await expect(api.$path('/required').get({ query: {}, extensions: { query } })).rejects.toThrow(
    /Missing required/,
  );
  await expect(
    api.$path('/optional').get({ query: { unknown: 1 }, extensions: { query } }),
  ).rejects.toThrow(/does not declare/);
  await expect(
    api.$path('/optional').get({ query: {}, querystring: {}, extensions: { query } }),
  ).rejects.toThrow(/cannot be used together/);
  expect(query).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test('whole-query callbacks run for empty records but omitted inputs and unextended empty records remain no-ops', async () => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const querystring = vi.fn<() => string>(() => '?q=custom');
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    transport,
    metadata,
  }) as unknown as Runtime;
  await api.$path('/whole').get({ querystring: {}, extensions: { querystring } });
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/whole?q=custom');
  await api.$path('/whole').get({ extensions: { querystring } });
  await api.$path('/whole').get({ querystring: {} });
  expect(querystring).toHaveBeenCalledOnce();
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/whole');
});
