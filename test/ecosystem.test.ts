import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createCatalog } from '../examples/integrations/api.js';
import { catalogQueries } from '../examples/integrations/tanstack.js';
import { handlers } from '../examples/integrations/handlers.js';
import { HttpError } from '../packages/core/src/index.js';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('TanStack caches by operation input and caller scope; mutations explicitly invalidate', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  try {
    const a = catalogQueries(createCatalog('https://catalog.test', 'alice'), 'catalog:alice');
    const b = catalogQueries(createCatalog('https://catalog.test', 'bob'), 'catalog:bob');
    const input = { id: 'book', locale: 'en' };
    const result = await client.fetchQuery(a.detail(input));
    expect(result).toEqual({ id: 'book', label: 'en:Bearer alice' });
    expect(await client.fetchQuery(a.detail({ locale: 'en', id: 'book' }))).toBe(result);
    expect((await client.fetchQuery(b.detail(input))).label).toBe('en:Bearer bob');
    expect((await client.fetchQuery(a.detail({ ...input, locale: 'fr' }))).label).toBe(
      'fr:Bearer alice',
    );
    const mutation = client.getMutationCache().build(client, a.update());
    expect(await mutation.execute({ id: 'book', label: 'edited' })).toEqual({
      id: 'book',
      label: 'edited',
    });
    await client.invalidateQueries({ queryKey: a.prefix });
    expect(client.getQueryState(a.detail(input).queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(b.detail(input).queryKey)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});

test('HTTP errors enter TanStack error state instead of becoming successful cached results', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const options = catalogQueries(
      createCatalog('https://catalog.test', 'alice'),
      'catalog:alice',
    ).detail({ id: 'missing', locale: 'en' });
    await expect(client.fetchQuery(options)).rejects.toBeInstanceOf(HttpError);
    expect(client.getQueryState(options.queryKey)?.status).toBe('error');
  } finally {
    client.clear();
  }
});

test('TanStack cancellation aborts the actual fetch request', async () => {
  let started = false;
  let aborted = false;
  server.use(
    http.get('https://catalog.test/items/:id', async ({ request }) => {
      started = true;
      await new Promise<void>((resolve) => {
        const abort = () => {
          aborted = true;
          resolve();
        };
        if (request.signal.aborted) abort();
        else request.signal.addEventListener('abort', abort, { once: true });
      });
      return HttpResponse.json({ id: 'slow', label: 'unused' });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const options = catalogQueries(
      createCatalog('https://catalog.test', 'alice'),
      'catalog:alice',
    ).detail({ id: 'slow', locale: 'en' });
    const pending = client.fetchQuery(options).catch((error: unknown) => error);
    await vi.waitFor(() => expect(started).toBe(true));
    await client.cancelQueries({ queryKey: options.queryKey });
    await pending;
    await vi.waitFor(() => expect(aborted).toBe(true));
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
  } finally {
    client.clear();
  }
});
