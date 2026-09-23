import { expect, test, vi } from 'vitest';
import { createClient, type RequestInput, type Transport } from '../packages/core/src/index.js';

test.each(['*/*', 'text/*', 'application/*+json'])(
  'core rejects wildcard media %s before body extensions',
  async (contentType) => {
    const body = vi.fn<() => string>(() => 'custom');
    const transport = vi.fn<Transport>();
    const api = createClient({ baseUrl: 'https://api.test', transport }) as unknown as {
      x: { post(input: RequestInput): Promise<unknown> };
    };
    await expect(
      api.x.post({ body: 'value', contentType, extensions: { body } }),
    ).rejects.toMatchObject({ code: 'SERIALIZATION' });
    expect(body).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  },
);
