import { expect, test, vi } from 'vitest';
import { createClient, type RequestInput, type Transport } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { stringifyJson } from '../src/json.js';

const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: { '/x': { post: { requestBody: { content: { 'application/json': {} } } } } },
});
const cyclic: Record<string, unknown> = {};
cyclic.self = cyclic;
test.each([() => {}, Symbol('x'), { toJSON: () => undefined }, 1n, cyclic])(
  'JSON failure case %# never reaches transport',
  async (body) => {
    for (const strict of [false, true]) {
      const transport = vi.fn<Transport>();
      const options = { baseUrl: 'https://api.test', transport };
      const api = (strict
        ? createStrictClient({ ...options, metadata })
        : createClient(options)) as unknown as {
        x: { post(input: RequestInput): Promise<unknown> };
      };
      await expect(api.x.post({ body, contentType: 'application/json' })).rejects.toThrow(
        /Cannot serialize JSON.*body.*application\/json/,
      );
      expect(transport).not.toHaveBeenCalled();
    }
  },
);
test('preserves JSON failure causes and valid JSON scalar values', () => {
  const cause = new Error('toJSON failed');
  expect(() =>
    stringifyJson(
      {
        toJSON() {
          throw cause;
        },
      },
      'test',
    ),
  ).toThrow(expect.objectContaining({ cause }));
  expect(stringifyJson(null, 'test')).toBe('null');
  expect(stringifyJson(false, 'test')).toBe('false');
});

test.each(['multipart/form-data', 'application/x-www-form-urlencoded'])(
  'JSON part cannot turn into an undefined string in %s',
  async (contentType) => {
    const transport = vi.fn<Transport>();
    const metadata = compileOpenAPIMetadata({
      openapi: '3.2.0',
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: { [contentType]: { schema: { properties: { field: { type: 'object' } } } } },
            },
          },
        },
      },
    });
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
    await expect(
      api.x.post({ body: { field: { toJSON: () => undefined } }, contentType }),
    ).rejects.toThrow(/JSON.*field field.*application\/json/);
    expect(transport).not.toHaveBeenCalled();
  },
);
