import { expect, test, vi } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
import type { RequestInput, Transport } from '../src/index.js';

function client(outer: string, encoding: object) {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              [outer]: {
                schema: { properties: { obj: { type: 'object' } } },
                encoding: { obj: encoding },
              },
            },
          },
        },
      },
    },
  });
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    transport,
  }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
  return { api, transport };
}
test.each(['multipart/form-data', 'application/x-www-form-urlencoded'])(
  'propagates applicable nested encoding in %s',
  async (outer) => {
    for (const contentType of ['multipart/mixed', 'application/x-www-form-urlencoded']) {
      const { api, transport } = client(outer, { contentType, encoding: { x: { style: 'form' } } });
      await expect(api.x.post({ body: { obj: { x: 'a' } } })).rejects.toThrow(
        /nested part control/,
      );
      expect(transport).not.toHaveBeenCalled();
      await api.x.post({ body: { obj: { x: 'a' } }, extensions: { body: () => 'custom wire' } });
      expect(transport).toHaveBeenCalledOnce();
    }
  },
);
test.each(['multipart/form-data', 'application/x-www-form-urlencoded'])(
  'ignores nested encoding for a JSON part in %s',
  async (outer) => {
    const { api, transport } = client(outer, {
      encoding: { x: { style: 'form' } },
      prefixEncoding: [],
    });
    await api.x.post({ body: { obj: { x: 'a' } } });
    const body = transport.mock.calls[0]![0].init.body;
    const actual =
      typeof body === 'string'
        ? new URLSearchParams(body).get('obj')
        : await ((body as FormData).get('obj') as Blob).text();
    expect(actual).toBe('{"x":"a"}');
  },
);
