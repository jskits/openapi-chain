import { expect, test } from 'vitest';
import { createClient, type TransportRequest } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
type Paths = {
  '/x': {
    post: {
      requestBody: { content: { 'application/custom': { x: number } } };
      responses: { 204: { content: never } };
    };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: { '/x': { post: { requestBody: { content: { 'application/custom': {} } } } } },
});
test.each([false, true])(
  'request customization runs after serialization, strict=%s',
  async (strict) => {
    const order: string[] = [];
    const options = {
      baseUrl: 'https://example.test',
      transport: async (request: TransportRequest) => {
        order.push('transport');
        expect(request.init.body).toBe('encoded');
        return new Response(null, { status: 204 });
      },
    };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    const request = (value: TransportRequest) => {
      order.push('request');
      return value;
    };
    await expect(
      api.x.post({ contentType: 'application/custom', body: { x: 1 }, extensions: { request } }),
    ).rejects.toThrow(/extension/);
    expect(order).toEqual([]);
    await api.x.post({
      contentType: 'application/custom',
      body: { x: 1 },
      extensions: {
        request,
        body: () => {
          order.push('body');
          return 'encoded';
        },
      },
    });
    expect(order).toEqual(['body', 'request', 'transport']);
  },
);
