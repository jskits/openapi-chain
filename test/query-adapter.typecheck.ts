import { createQuery } from '../packages/query/src/index.js';

interface SearchInput {
  query: string;
  filters?: { tags: readonly string[]; page?: number };
}

const search = createQuery({
  key: ['account', 'GET', '/search'],
  fetcher: async (input: SearchInput) => input.query,
});
search.queryOptions({ query: 'book' });
search.swr({ query: 'book', filters: { tags: ['fiction'] } });
// @ts-expect-error the operation input type remains required
search.queryOptions({ filters: { tags: [] } });

createQuery({ key: ['empty'], fetcher: async (_input: {}) => 'ok' }).queryOptions({});
interface TreeInput {
  value: string;
  children?: TreeInput[];
}
createQuery({ key: ['tree'], fetcher: async (input: TreeInput) => input.value });

const dynamic = createQuery({ key: ['dynamic'], fetcher: async (input: unknown) => input });
dynamic.queryOptions({ value: 'checked at runtime' });

// @ts-expect-error Date is not a JSON cache input
createQuery({ key: ['date'], fetcher: async (input: Date) => input.toISOString() });
// @ts-expect-error undefined is not a query input
createQuery({ key: ['missing'], fetcher: async (input: undefined) => input });
// @ts-expect-error bigint is not a JSON cache input
createQuery({ key: ['bigint'], fetcher: async (input: bigint) => input });
// @ts-expect-error nested functions are not JSON cache inputs
createQuery({ key: ['callback'], fetcher: async (input: { nested: { run(): void } }) => input });
// @ts-expect-error required undefined fields cannot be serialized
createQuery({ key: ['undefined'], fetcher: async (input: { id: string | undefined }) => input });
// @ts-expect-error symbol keys cannot be serialized
createQuery({ key: ['symbol'], fetcher: async (input: { [Symbol.iterator]: string }) => input });
