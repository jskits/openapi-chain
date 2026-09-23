import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';
import { createStrictClient } from '../packages/core/src/strict.js';
import { createClient, type RequestInput, type Transport } from '../packages/core/src/index.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { isPlainRecord } from '../packages/core/src/record.js';

class Instance {
  field = 'x';
}
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: {
    '/x': {
      post: {
        parameters: [
          {
            name: 'filter',
            in: 'query',
            style: 'deepObject',
            explode: true,
            schema: { type: 'object' },
          },
        ],
        requestBody: {
          content: { 'multipart/form-data': {}, 'application/x-www-form-urlencoded': {} },
        },
      },
    },
  },
});
test.each([new Date(), new Blob(['x']), new Map([['a', 1]]), new Set(['x']), new Instance()])(
  'rejects non-record case %# instead of dropping values',
  async (value) => {
    const transport = vi.fn<Transport>();
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
    for (const contentType of ['multipart/form-data', 'application/x-www-form-urlencoded']) {
      await expect(api.x.post({ body: value, contentType })).rejects.toThrow(
        /body must be an object/,
      );
    }
    await expect(api.x.post({ query: { filter: value } })).rejects.toThrow(/object/);
    const core = createClient({ baseUrl: 'https://api.test', transport }) as unknown as typeof api;
    await expect(core.x.post({ query: { filter: value } })).rejects.toThrow(/plain record/);
    expect(transport).not.toHaveBeenCalled();
  },
);
test('accepts ordinary records in either realm and null-prototype dictionaries', () => {
  expect(isPlainRecord({})).toBe(true);
  expect(isPlainRecord(Object.create(null))).toBe(true);
  expect(isPlainRecord(runInNewContext('({ value: 1 })'))).toBe(true);
  expect(isPlainRecord(Object.create({ inherited: true }))).toBe(false);
});
