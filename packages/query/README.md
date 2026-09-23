# @openapi-chain/query

An optional, dependency-free bridge from explicit typed operations to TanStack Query and SWR. It does not inspect client Proxies, generate hooks, retry requests or infer cache invalidation.

```sh
pnpm add @openapi-chain/query
```

```ts
import { createQuery } from '@openapi-chain/query';

const item = createQuery({
  key: ['production:catalog:account-123', 'GET', '/items/{id}'],
  fetcher: (input: { id: string; locale: string }, { signal }) =>
    api.items(input.id).get({
      query: { locale: input.locale },
      init: { signal },
    }),
});

// TanStack Query v5; pass through queryOptions() if you want branded cache-key inference.
useQuery(item.queryOptions({ id: 'book', locale: 'en' }));

// SWR v2; null disables the query.
const options = item.swr({ id: 'book', locale: 'en' });
useSWR(options.key, options.fetcher);
```

Install your chosen framework library separately. The package has no React, query-library or client runtime dependencies. It works with core and strict clients; use the client's default throwing HTTP error mode or explicitly unwrap unsuccessful results in your fetcher.

Include every response-affecting input in the operation input or key prefix, including a non-secret server/account/permission scope. Do not put credentials in keys. Keys and inputs must contain only finite JSON values: plain objects, arrays, strings, numbers, booleans and null. Omit optional fields instead of assigning undefined. Dates, BigInts, signals, functions, cyclic objects, sparse arrays and arrays with extra properties are rejected before a request can start. Object keys named `__proto__` are also rejected, including in nested inputs and prefixes, because TanStack Query's default hash can discard them and reuse another input's cache entry. Inputs and prefixes are copied and recursively frozen, so mutations after options creation cannot change a request behind its cache key. Fetchers must treat inputs as read-only.

`prefix` is available for deliberate cache invalidation; `key(input)` constructs the exact operation key. `queryOptions(input)` forwards TanStack's AbortSignal. `swr(input)` passes `signal: null` because SWR supplies no framework cancellation signal and promises no automatic request abortion. Mutations, retries, infinite queries, optimistic updates and invalidation relationships remain application/framework policy. Configure these directly in TanStack Query or SWR.

See the repository's [integration recipes](https://github.com/jskits/openapi-chain/blob/main/docs/integrations.md) for MSW, error handling and account isolation. Local tarball tests do not imply that this package version is published.
