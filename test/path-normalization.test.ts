import { expect, test } from 'vitest';
import { createClient, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = {
  '/files/{id}': {
    parameters: { path: { id: string } };
    get: { responses: { 204: { content: never } } };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.2.1',
  paths: {
    '/files/{id}': {
      get: {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            allowReserved: true,
            schema: { type: 'string' },
          },
        ],
      },
    },
  },
});
test.each([false, true])(
  'rejects path normalization before transport, strict=%s',
  async (strict) => {
    let calls = 0;
    const transport: Transport = async () => {
      calls++;
      return new Response(null, { status: 204 });
    };
    const options = { baseUrl: 'https://example.test/api', transport };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    for (const id of ['.', '..']) {
      await expect(api.files(id).get()).rejects.toThrow(/Dot path segments/);
      await expect(api.$path('/files/{id}', { id }).get()).rejects.toThrow(/Dot path segments/);
    }
    for (const replacement of ['%2e', '%2E.', '.%2e', '%2e%2e', 'safe/../admin']) {
      await expect(api.files('x').get({ extensions: { path: () => replacement } })).rejects.toThrow(
        /Dot path segments/,
      );
    }
    expect(calls).toBe(0);
    await api.files('file.txt').get();
    expect(calls).toBe(1);
  },
);
test('strict reserved expansion rejects encoded dot segments', async () => {
  const api = createStrictClient<Paths>({
    baseUrl: 'https://example.test',
    metadata,
    transport: async () => {
      throw new Error('transport must not run');
    },
  });
  await expect(api.files('%2e%2e').get()).rejects.toThrow(/Dot path segments/);
});
