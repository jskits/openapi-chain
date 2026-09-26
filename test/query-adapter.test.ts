import { expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createQuery, type ReadonlyQueryInput } from '../packages/query/src/index.js';

test('immutable snapshots bind the cached identity to the actual fetch input', async () => {
  const prefix = ['account-a', 'GET', '/items/{id}'];
  type Input = {
    id: string;
    filter: { tags: string[] };
    enabled: boolean;
    page: number;
    extra: null;
  };
  const fetcher = vi.fn<(input: ReadonlyQueryInput<Input>) => Promise<ReadonlyQueryInput<Input>>>(
    async (input) => input,
  );
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
    expect(fetcher.mock.calls[0]![0]).toBe(options.queryKey.at(-1));
    expect(Object.isFrozen(fetcher.mock.calls[0]![0])).toBe(true);
    expect(Object.isFrozen(fetcher.mock.calls[0]![0].filter.tags)).toBe(true);
  } finally {
    client.clear();
  }
});

test('snapshot preserves ordinary keys and permits shared noncyclic JSON references', async () => {
  const query = createQuery({
    key: ['test'],
    fetcher: async (input: Record<string, unknown>) => input,
  });
  const child = { value: 1 };
  const input: Record<string, unknown> = { constructor: 'x', toString: 'y' };
  input.left = child;
  input.right = child;
  const options = query.swr(input);
  const result = await options.fetcher(options.key!);
  expect(result).toBe(options.key!.at(-1));
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.hasOwn(result, 'constructor')).toBe(true);
  expect(Object.getOwnPropertyDescriptor(result, 'toString')?.value).toBe('y');
  expect(result.left).toEqual(result.right);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(query.swr(null).key).toBeNull();
  expect(query.key(Object.assign(Object.create(null), { id: 'a' }))).toEqual(['test', { id: 'a' }]);
});

test('rejects prototype keys before TanStack can reuse a different input from its cache', async () => {
  const fetcher = vi.fn<(input: Record<string, unknown>) => Promise<Record<string, unknown>>>(
    async (input) => input,
  );
  const query = createQuery({ key: ['test'], fetcher });
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  try {
    await client.fetchQuery(query.queryOptions({}));
    for (const input of [{ ['__proto__']: { id: 'other' } }, { nested: { ['__proto__']: 1 } }]) {
      expect(() => query.queryOptions(input)).toThrow(/__proto__/);
      expect(() => query.swr(input)).toThrow(/__proto__/);
    }
    expect(() => createQuery({ key: [{ ['__proto__']: 'scope' }], fetcher })).toThrow(/__proto__/);
    expect(fetcher).toHaveBeenCalledOnce();
  } finally {
    client.clear();
  }
});

test('rejects arrays with extra properties instead of dropping fetch inputs', () => {
  const query = createQuery({ key: ['test'], fetcher: async (input: unknown) => input });
  expect(() => query.key(Object.assign(['a'], { account: 'other' }))).toThrow(/array/);
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
