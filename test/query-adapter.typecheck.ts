import { createClient } from '../packages/core/src/index.js';
import {
  createQuery,
  type OperationQueryKey,
  type ReadonlyQueryInput,
} from '../packages/query/src/index.js';
import type { paths as ConformancePaths } from './fixtures/conformance-schema.js';

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
createQuery<TreeInput, string>({
  key: ['tree'],
  fetcher: async (input) => {
    // @ts-expect-error nested arrays in the fetcher snapshot are readonly
    input.children?.push({ value: 'changed' });
    return input.value;
  },
});

type MutableInput = { id: string; filters: { tags: string[] } };
const immutable = createQuery<MutableInput, number>({
  key: ['immutable'],
  fetcher: async (input) => {
    // @ts-expect-error the fetcher cannot rewrite a snapshot field
    input.id = 'changed';
    // @ts-expect-error nested arrays in the fetcher snapshot are readonly
    input.filters.tags.push('changed');
    return input.filters.tags.length;
  },
});
immutable.queryOptions({ id: 'a', filters: { tags: ['fiction'] } });
const mapped = createQuery({
  key: ['mapped'],
  fetcher: async (input: ReadonlyQueryInput<MutableInput>) => input.id,
});
mapped.queryOptions({ id: 'a', filters: { tags: ['fiction'] } });
// @ts-expect-error the snapshot annotation still infers the operation input
mapped.queryOptions({ id: 1, filters: { tags: [] } });
type ImmutableKey = OperationQueryKey<MutableInput>;
type ImmutableSnapshot = ImmutableKey extends readonly [...unknown[], infer Last] ? Last : never;
declare const immutableSnapshot: ImmutableSnapshot;
const frozenInput: ReadonlyQueryInput<MutableInput> = immutableSnapshot;
void frozenInput;
// @ts-expect-error the public operation key exposes the same readonly array
immutableSnapshot.filters.tags.push('changed');

// The generated OpenAPI operation expects a mutable array, while the cached
// Query snapshot is readonly. Copy the array when forwarding it to that API.
const client = createClient<ConformancePaths>({ baseUrl: 'https://api.test' });
const colors = createQuery({
  key: ['colors'],
  fetcher: async (input: { color: readonly string[] }) => {
    // @ts-expect-error the generated request type does not accept readonly arrays
    void client.search.get({ query: { color: input.color } });
    return client.search.get({ query: { color: [...input.color] } });
  },
});
colors.queryOptions({ color: ['red'] });
colors.queryOptions({ color: ['red', 'blue'] as readonly string[] });
type ColorsSnapshot =
  ReturnType<typeof colors.key> extends readonly [...unknown[], infer Last] ? Last : never;
declare const colorsSnapshot: ColorsSnapshot;
// @ts-expect-error readonly arrays stay readonly in the public key type
colorsSnapshot.color.push('changed');

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
