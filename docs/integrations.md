# Query caching and HTTP mocks

[Documentation index](README.md)

Keep caching, retries and framework lifecycle in TanStack Query or SWR. The client handles typed requests and responses. The [runnable recipes](../examples/integrations/) use a small catalog schema and are covered by actual TanStack Query, SWR hooks and MSW interception tests in `pnpm test`.

Install your chosen integration as an application dependency:

```sh
pnpm add @tanstack/react-query
# or
pnpm add swr
pnpm add -D msw
```

React is a peer dependency of the React integrations. The library core does not depend on any of these packages. The examples import repository source; use `openapi-chain` in your application and generate your own `paths` type. These recipes use core-compatible JSON operations; the same pattern works with a metadata-backed strict client.

## TanStack Query

The [TanStack recipe](../examples/integrations/tanstack.ts) builds `queryOptions` from a typed operation. Include every data-affecting input in the key and forward the query function's `signal` through `init.signal`.

```ts
const queries = catalogQueries(api, 'production:catalog:account-123');
const options = queries.detail({ id: 'book', locale: 'en' });
// Inside a component under QueryClientProvider:
const { data, error } = useQuery(options);
// Or outside React:
const item = await queryClient.fetchQuery(options);
```

The cache scope must distinguish servers, tenants and accounts that can return different data for the same operation. Use a non-secret identity, not an access token. Replace the scope or clear the cache when authorization context changes, including permission changes within one account. Path parameters, query parameters and representation choices belong in the key. Do not include `AbortSignal`, callbacks or arbitrary `RequestInit` objects.

Use the default `throwOnError: true`: HTTP failures then enter the query library's error state as `HttpError`. A `throwOnError: false` client resolves unsuccessful HTTP results; explicitly unwrap and throw those results before using it as a fetcher. Network, cancellation and parsing failures still reject independently of HTTP status.

Mutations are explicit. After an update, choose the affected queries to invalidate:

```ts
const mutation = useMutation({
  ...queries.update(),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queries.prefix }),
});
mutation.mutate({ id: 'book', label: 'Updated' });
```

Configure retry policy in TanStack Query; do not add a second automatic retry layer to the client. Only classify operations as queries when their application semantics permit caching and re-fetching. The HTTP method alone is not enough to infer mutation safety.

## SWR

The [SWR recipe](../examples/integrations/swr.ts) returns a key and a typed fetcher. The input in the key drives the request. A null input disables the query:

```ts
const detail = catalogSWR(api, 'production:catalog:account-123');
const options = detail(selectedId ? { id: selectedId, locale: 'en' } : null);
const { data, error } = useSWR(options.key, options.fetcher);
```

Provide the same scope isolation as in TanStack Query. Use SWR's mutation/revalidation APIs after writes. SWR does not supply TanStack's query-function cancellation signal in this recipe; it does not promise automatic fetch abortion on unmount. Application-managed cancellation requires a separately managed controller.

## MSW

Mock at the HTTP boundary so the real client still performs URL construction, serialization and response parsing. Share [handlers](../examples/integrations/handlers.ts) between Node `setupServer` and browser `setupWorker`.

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Use an absolute API URL in Node handlers. Browser setup additionally requires MSW's generated service worker and `await worker.start()` before starting application requests. Keep handlers and worker setup in development/test entry points. Do not include them in the production client bundle.

For strict-specific form styles, trailing slashes and multipart encoding, assert the received URL, headers and body in handlers. Keep an independent real HTTP test as well: interception is not evidence for CORS, redirects, streaming behavior or browser cookies.

References: [TanStack query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation), [SWR arguments](https://swr.vercel.app/docs/arguments), [MSW getting started](https://mswjs.io/docs/getting-started).
