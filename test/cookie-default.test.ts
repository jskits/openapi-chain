import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
import type { RequestInput } from '../src/index.js';

test('OAS 3.2 cookie style defaults to exploded wire serialization', async () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: {
      '/x': {
        get: {
          parameters: [
            { in: 'cookie', name: 'session', style: 'cookie', schema: { type: 'object' } },
          ],
        },
      },
    },
  });
  expect(metadata.operations['/x']!.get!.parameters!.cookie!.session!.explode).toBe(true);
  let cookie: string | null = null;
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    transport: async (request) => {
      cookie = new Headers(request.init.headers).get('cookie');
      return new Response(null, { status: 204 });
    },
  }) as unknown as { x: { get(input: RequestInput): Promise<unknown> } };
  await api.x.get({ cookie: { session: { a: 'hello', b: 'world' } } });
  expect(cookie).toBe('a=hello; b=world');
});
