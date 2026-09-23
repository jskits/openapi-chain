import { expect, test } from 'vitest';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = {
  '/x/{id}': {
    parameters: { path: { id: string } };
    post: {
      parameters: { query: { q: string } };
      requestBody: { content: { 'application/x-www-form-urlencoded': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
};

test.each([
  ['😀中文', '%F0%9F%98%80%E4%B8%AD%E6%96%87'],
  ['a%20b:c', 'a%20b:c'],
  ['😀%25x', '%F0%9F%98%80%25x'],
])('reserved expansion preserves Unicode and encoded triples: %s', async (value, encoded) => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.1',
    paths: {
      '/x/{id}': {
        post: {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              allowReserved: true,
              schema: { type: 'string' },
            },
            {
              name: 'q',
              in: 'query',
              required: true,
              allowReserved: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/x-www-form-urlencoded': { encoding: { value: { allowReserved: true } } },
            },
          },
        },
      },
    },
  });
  let called = false;
  const api = createStrictClient<Paths>({
    baseUrl: 'https://example.test',
    metadata,
    transport: async (request) => {
      called = true;
      expect(request.url).toBe(`https://example.test/x/${encoded}?q=${encoded}`);
      expect(request.init.body).toBe(`value=${encoded}`);
      return new Response(null, { status: 204 });
    },
  });
  await api.x(value).post({ query: { q: value }, body: { value } });
  expect(called).toBe(true);
});
