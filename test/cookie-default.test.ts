import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { RequestInput } from '../packages/core/src/index.js';

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

test.each(['3.0.3', '3.1.1', '3.2.0'])(
  'primitive form cookie with explode=false serializes in %s',
  async (openapi) => {
    const metadata = compileOpenAPIMetadata({
      openapi,
      paths: {
        '/x': {
          get: {
            parameters: [
              {
                in: 'cookie',
                name: 'session',
                style: 'form',
                explode: false,
                schema: { type: 'string' },
              },
              {
                in: 'cookie',
                name: 'prefs',
                style: 'form',
                explode: false,
                schema: { type: 'array', items: { type: 'string' } },
              },
            ],
          },
        },
      },
    });
    const cookies: (string | null)[] = [];
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport: async (request) => {
        cookies.push(new Headers(request.init.headers).get('cookie'));
        return new Response(null, { status: 204 });
      },
    }) as unknown as { x: { get(input: RequestInput): Promise<unknown> } };
    await api.x.get({ cookie: { session: 'a b' } });
    expect(cookies).toEqual(['session=a%20b']);
    await expect(api.x.get({ cookie: { prefs: ['a', 'b'] } })).rejects.toThrow(
      /compound parameter prefs/,
    );
    expect(cookies).toHaveLength(1);
  },
);

test('OAS 3.2 cookie style with explode=false accepts primitives and rejects compounds', async () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: {
      '/x': {
        get: {
          parameters: [
            { in: 'cookie', name: 'session', style: 'cookie', explode: false, schema: {} },
          ],
        },
      },
    },
  });
  const cookies: (string | null)[] = [];
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    transport: async (request) => {
      cookies.push(new Headers(request.init.headers).get('cookie'));
      return new Response(null, { status: 204 });
    },
  }) as unknown as { x: { get(input: RequestInput): Promise<unknown> } };
  await api.x.get({ cookie: { session: 'abc' } });
  expect(cookies).toEqual(['session=abc']);
  for (const session of [['a', 'b'], { a: 'b' }]) {
    await expect(api.x.get({ cookie: { session } })).rejects.toThrow(/not supported/);
  }
  expect(cookies).toHaveLength(1);
});
