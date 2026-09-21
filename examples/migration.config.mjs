import { readFileSync } from 'node:fs';

export default {
  document: JSON.parse(readFileSync(new URL('./service.openapi.json', import.meta.url), 'utf8')),
  scenarios: [
    {
      name: 'read an item',
      path: '/items/{id}',
      params: () => ({ id: '42' }),
      response: () =>
        new Response('{"id":"42","name":"Item"}', {
          headers: { 'content-type': 'application/json' },
        }),
    },
  ],
};
