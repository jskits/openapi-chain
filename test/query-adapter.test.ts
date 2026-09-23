import { expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createQuery } from '../query/src/index.js';

test('immutable snapshots bind the cached identity to the actual fetch input', async () => {
  const prefix = ['account-a', 'GET', '/items/{id}'];
  type Input = {
    id: string;
    filter: { tags: string[] };
    enabled: boolean;
    page: number;
    extra: null;
  };
  const fetcher = vi.fn<(input: Input) => Promise<Input>>(async (input) => input);
  const query = createQuery({ key: prefix, fetcher });
  const input = { id: 'book', filter: { tags: ['a'] }, enabled: true, page: 1, extra: null };
  const options = query.queryOptions(input);
  input.id = 'changed';
  input.filter.tags.push('b');
  prefix[0] = 'account-b';
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  try {
    expect(await client.fetchQuery(options)).toEqual({
      id: 'book',
      filter: { tags: ['a'] },
      enabled: true,
      page: 1,
      extra: null,
    });
    expect(query.prefix[0]).toBe('account-a');
    expect(Object.isFrozen(options.queryKey)).toBe(true);
    expect(Object.isFrozen(fetcher.mock.calls[0]![0].filter.tags)).toBe(true);
  } finally {
    client.clear();
  }
});

test('snapshot preserves prototype-like keys and permits shared noncyclic JSON references', async () => {
  const query = createQuery({
    key: ['test'],
    fetcher: async (input: Record<string, unknown>) => input,
  });
  const child = { value: 1 };
  const input: Record<string, unknown> = JSON.parse('{"__proto__":{"value":1},"constructor":"x"}');
  input.left = child;
  input.right = child;
  const options = query.swr(input);
  const result = await options.fetcher(options.key!);
  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(result.left).toEqual(result.right);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(query.swr(null).key).toBeNull();
  expect(query.key(Object.assign(Object.create(null), { id: 'a' }))).toEqual(['test', { id: 'a' }]);
});

const sparse: unknown[] = [];
sparse.length = 1;

test.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => 1,
  Symbol('key'),
  new Date(),
  new AbortController().signal,
  sparse,
])('rejects non-JSON query input before invoking the fetcher: %s', (input) => {
  const fetcher = vi.fn<(value: unknown) => Promise<unknown>>(async (value) => value);
  const query = createQuery({ key: ['test'], fetcher });
  expect(() => query.queryOptions(input)).toThrow(TypeError);
  expect(fetcher).not.toHaveBeenCalled();
});

test('rejects cyclic data, undefined fields and empty key prefixes', () => {
  const query = createQuery({ key: ['test'], fetcher: async (input: unknown) => input });
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(() => query.key(cycle)).toThrow(/cycles/);
  expect(() => query.key({ omitted: undefined })).toThrow(/JSON/);
  expect(() => query.key({ [Symbol('hidden')]: 'value' })).toThrow(/symbol/);
  expect(Object.is(query.key(-0)[1], -0)).toBe(false);
  expect(() => createQuery({ key: [], fetcher: async () => null })).toThrow(/nonempty/);
});
