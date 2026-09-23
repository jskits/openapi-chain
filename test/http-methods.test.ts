import { expect, test } from 'vitest';
import { httpMethods, createClient } from '../packages/core/src/index.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

test('the public method table cannot mutate method recognition or compilation', async () => {
  expect(Object.isFrozen(httpMethods)).toBe(true);
  expect(() => (httpMethods as unknown as string[]).push('foo')).toThrow(TypeError);
  expect(Reflect.set(httpMethods, '0', 'foo')).toBe(false);
  const methods: string[] = [];
  const api = createClient<{ '/x': { get: { responses: { 204: { content: never } } } } }>({
    baseUrl: 'https://api.test',
    transport: async (request) => {
      methods.push(request.init.method!);
      return new Response(null, { status: 204 });
    },
  });
  await api.x.get();
  expect(methods).toEqual(['GET']);
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: { '/x': { get: {}, query: {} } },
  });
  expect(Object.keys(metadata.operations['/x']!)).toEqual(['get', 'query']);
});
