import { expect, test } from 'vitest';
import { createClient, type RequestInput } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/x': { get: {} } } });
function clients() {
  const options = {
    baseUrl: 'https://api.test',
    transport: async () => new Response(null, { status: 204 }),
  };
  return [createClient(options), createStrictClient({ ...options, metadata })] as unknown as {
    x: { get(input: RequestInput): Promise<unknown> };
  }[];
}
test.each([
  null,
  undefined,
  204,
  [],
  { status: 204 },
  { status: '204', data: null },
  { status: 200, data: null },
])('rejects malformed response extension result %j across both entries', async (value) => {
  for (const api of clients())
    await expect(
      api.x.get({ extensions: { response: () => value } } as unknown as RequestInput),
    ).rejects.toThrow(/Response status mismatch or missing data/);
});
test('explicit data undefined remains valid for empty responses', async () => {
  for (const api of clients())
    await expect(
      api.x.get({ extensions: { response: () => ({ status: 204, data: undefined }) } }),
    ).resolves.toBeUndefined();
});
