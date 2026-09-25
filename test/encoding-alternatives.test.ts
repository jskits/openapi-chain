import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';

// Shape of PeerTube's video import: common fields plus one of several source fields.
function compile(encoding: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return compileOpenAPIMetadata({
    openapi: '3.0.3',
    components: {
      schemas: {
        Common: { type: 'object', properties: { name: { type: 'string' } } },
        Source: {
          type: 'object',
          oneOf: [
            { properties: { targetUrl: { type: 'string' } } },
            { properties: { torrentfile: { type: 'string', format: 'binary' } } },
          ],
        },
        Nested: { oneOf: [{ $ref: '#/components/schemas/Nested' }, { properties: { note: {} } }] },
        ...extra,
      },
    },
    paths: {
      '/imports': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Source' },
                    { $ref: '#/components/schemas/Common' },
                    { anyOf: [{ properties: { tags: { type: 'string' } } }] },
                    { $ref: '#/components/schemas/Nested' },
                  ],
                },
                encoding,
              },
            },
          },
        },
      },
    },
  });
}

test('encoding keys may name properties declared in oneOf or anyOf alternatives', async () => {
  const metadata = compile({
    torrentfile: { contentType: 'application/x-bittorrent' },
    tags: { contentType: 'text/plain' },
    note: { contentType: 'application/json' },
  });
  const parts: string[] = [];
  const api = createStrictClient({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ url, init }) => {
      for (const [name, part] of (await new Request(url, init).formData()).entries())
        parts.push(typeof part === 'string' ? `${name}=${part}` : `${name}:${part.type}`);
      return new Response(null, { status: 204 });
    },
  }) as unknown as { imports: { post(input: { body: unknown }): Promise<unknown> } };
  const torrent = new File(['d8:announce'], 'video.torrent', { type: 'application/octet-stream' });
  await api.imports.post({ body: { name: 'clip', torrentfile: torrent } });
  expect(parts).toEqual(['name=clip', 'torrentfile:application/x-bittorrent']);
});

test('encoding keys that no alternative declares are still rejected', () => {
  expect(() => compile({ missing: { contentType: 'text/plain' } })).toThrow(
    /Encoding key missing is not a request-body schema property/,
  );
});
