import { expect, test } from 'vitest';
import { createClient, OpenAPIChainError, type RequestInput } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

test('compiler and initialization failures expose stable codes without losing TypeError compatibility', () => {
  expect(() => compileOpenAPIMetadata({ openapi: 'broken' })).toThrow(
    expect.objectContaining({ code: 'METADATA_COMPILE' }),
  );
  expect(() => createStrictClient({ baseUrl: 'https://api.test' } as never)).toThrow(
    expect.objectContaining({ code: 'METADATA_MISMATCH' }),
  );
  expect(new OpenAPIChainError('SERIALIZATION', 'bad')).toBeInstanceOf(TypeError);
});
test('request failures carry operation context and JSON causes across both entries', async () => {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.0',
    paths: { '/x': { post: { requestBody: { content: { 'application/json': {} } } } } },
  });
  const options = {
    baseUrl: 'https://api.test',
    transport: async () => new Response(null, { status: 204 }),
  };
  const clients = [
    createClient(options),
    createStrictClient({ ...options, metadata }),
  ] as unknown as { x: { post(input: RequestInput): Promise<unknown> } }[];
  const cause = new Error('cannot encode');
  for (const api of clients) {
    await expect(
      api.x.post({
        body: {
          toJSON() {
            throw cause;
          },
        },
        contentType: 'application/json',
      }),
    ).rejects.toMatchObject({ code: 'SERIALIZATION', method: 'POST', pathTemplate: '/x', cause });
    await expect(
      api.x.post({ extensions: { response: () => ({ status: 200, data: null }) } }),
    ).rejects.toMatchObject({ code: 'EXTENSION_CONTRACT', method: 'POST', pathTemplate: '/x' });
  }
});
