import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
import type { RequestInput } from '../src/index.js';

test.each([{ style: 'form' }, { explode: true }, { allowReserved: false }])(
  'explicit RFC6570 encoding ignores contentType: %j',
  async (style) => {
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.0',
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: { properties: { x: { type: 'object' } } },
                  encoding: { x: { contentType: 'application/json, application/xml', ...style } },
                },
              },
            },
          },
        },
      },
    });
    expect(
      metadata.operations['/x']!.post!.requestBody!.media!['application/x-www-form-urlencoded']!
        .encoding!.x,
    ).not.toHaveProperty('contentType');
    let body: unknown;
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport: async (request) => {
        body = request.init.body;
        return new Response(null, { status: 204 });
      },
    }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
    await api.x.post({ body: { x: { a: 'b' } } });
    expect(body).toBe('a=b');
  },
);
