import { expect, test } from 'vitest';
import { createClient } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
type Paths = {
  '/file': {
    get: { responses: { 200: { content: { 'application/octet-stream': ArrayBuffer } } } };
  };
};
const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/file': { get: {} } } });
test.each([false, true])(
  'explicit response parsing is portable across clients, strict=%s',
  async (strict) => {
    const options = {
      baseUrl: 'https://example.test',
      transport: async () =>
        new Response(new Uint8Array([0, 255, 65]), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
    };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    const data = await api.file.get({
      extensions: {
        response: async (response) => {
          if (response.status !== 200) throw new Error(`Unexpected status ${response.status}`);
          return { status: 200, data: await response.arrayBuffer() };
        },
      },
    });
    expect(new Uint8Array(data)).toEqual(new Uint8Array([0, 255, 65]));
  },
);
