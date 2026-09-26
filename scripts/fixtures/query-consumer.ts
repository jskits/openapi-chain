import { createQuery, type OperationQueryKey, type ReadonlyQueryInput } from '@openapi-chain/query';
import { createClient } from 'openapi-chain';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import useSWR from 'swr';

type Item = { id: string };
type Paths = {
  '/items/{id}': {
    parameters: { path: { id: string } };
    get: { responses: { 200: { content: { 'application/json': Item } } } };
  };
  '/search': {
    get: {
      parameters: { query: { tags: string[] } };
      responses: { 200: { content: { 'application/json': Item[] } } };
    };
  };
};
const api = createClient<Paths>({ baseUrl: 'https://api.test' });
const detail = createQuery({
  key: ['account-a', 'GET', '/items/{id}'],
  fetcher: (input: { id: string }, { signal }) => api.items(input.id).get({ init: { signal } }),
});
const options = queryOptions(detail.queryOptions({ id: 'book' }));
const client = new QueryClient();
const result: Promise<Item> = client.fetchQuery(options);
const cached: Item | undefined = client.getQueryData(options.queryKey);
void result;
void cached;
// @ts-expect-error operation input stays typed
detail.queryOptions({ id: 1 });
// @ts-expect-error required operation input is not optional
detail.swr({});
type SearchInput = { tags: readonly string[] };
const search = createQuery({
  key: ['account-a', 'GET', '/search'],
  fetcher: (input: ReadonlyQueryInput<SearchInput>, { signal }) =>
    api.search.get({ query: { tags: [...input.tags] }, init: { signal } }),
});
const readonlyTags: readonly string[] = ['a', 'b'];
search.queryOptions({ tags: readonlyTags });
// @ts-expect-error the installed adapter retains input inference
search.queryOptions({ tags: [1] });
type SearchSnapshot =
  OperationQueryKey<SearchInput> extends readonly [...unknown[], infer Last] ? Last : never;
declare const snapshot: SearchSnapshot;
// @ts-expect-error the installed declaration exposes a readonly array in the key
snapshot.tags.push('changed');
export function useItem(id: string | null) {
  const swr = detail.swr(id === null ? null : { id });
  const response = useSWR(swr.key, swr.fetcher);
  const item: Item | undefined = response.data;
  return item;
}
