import { expect, test } from 'vitest';
import { createCatalog } from '../examples/scoped/client.js';
import { selectedPaths } from '../examples/scoped/scope.js';
import { metadata } from '../examples/scoped/metadata.js';

test('the documented scope drives collection and item requests', async () => {
  expect(Object.keys(metadata.operations)).toEqual([...selectedPaths]);
  const urls: string[] = [];
  const api = createCatalog('https://api.test', async (request) => {
    urls.push(request.url);
    return new Response('{"id":"42","name":"book"}', {
      headers: { 'content-type': 'application/json' },
    });
  });
  await api.items.get({ query: { filter: { name: 'book' } } });
  expect((await api.items('42').get()).name).toBe('book');
  expect(urls).toEqual([
    'https://api.test/items?filter%5Bname%5D=book',
    'https://api.test/items/42',
  ]);
});
