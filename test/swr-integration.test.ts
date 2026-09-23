// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import useSWR, { SWRConfig } from 'swr';
import { setupServer } from 'msw/node';
import { createCatalog, type DetailInput } from '../examples/integrations/api.js';
import { catalogSWR } from '../examples/integrations/swr.js';
import { handlers } from '../examples/integrations/handlers.js';
import { HttpError } from '../src/index.js';

const server = setupServer(...handlers);
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function View({ token, input }: { token: string; input: DetailInput | null }) {
  const options = catalogSWR(
    createCatalog('https://catalog.test', token),
    `catalog:${token}`,
  )(input);
  const { data, error } = useSWR(options.key, options.fetcher);
  return createElement(
    'output',
    null,
    error instanceof HttpError ? `error:${error.status}` : (JSON.stringify(data) ?? 'idle'),
  );
}

test('real SWR hooks support disabled queries, account isolation and HTTP errors', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const cache = new Map();
  const config = {
    provider: () => cache,
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    dedupingInterval: 0,
  };
  const render = (token: string, input: DetailInput | null) =>
    act(async () => {
      root.render(
        createElement(SWRConfig, { value: config }, createElement(View, { token, input })),
      );
    });
  const shows = async (text: string) =>
    vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      expect(node.textContent).toContain(text);
    });
  try {
    await render('alice', null);
    expect(node.textContent).toBe('idle');
    expect(cache.size).toBe(0);
    await render('alice', { id: 'book', locale: 'en' });
    await shows('en:Bearer alice');
    await render('bob', { id: 'book', locale: 'en' });
    await shows('en:Bearer bob');
    await render('alice', { id: 'missing', locale: 'en' });
    await shows('error:404');
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});
