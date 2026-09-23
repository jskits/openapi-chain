import { expect, test, vi } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';
import type { RequestInput, Transport } from '../src/index.js';

function client(contentType: string) {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { properties: { value: { type: 'object' } } },
                encoding: { value: { contentType } },
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
  }) as unknown as {
    x: { post(input: RequestInput): Promise<unknown> };
  };
  return { api, transport };
}

test('quoted commas and escaped quotes stay within one multipart media declaration', async () => {
  const contentType = 'application/json; profile="a,b;c\\\"d"';
  const { api, transport } = client(contentType);
  await api.x.post({ body: { value: { id: 1 } } });
  const request = transport.mock.calls[0]![0];
  const wire = await new Request(request.url, request.init).text();
  expect(wire).toContain(`Content-Type: ${contentType}\r\n`);
  expect(wire).toContain('{"id":1}');
});

test('a real media list still requires an explicit whole-body serializer', async () => {
  const { api, transport } = client('application/json; profile="a,b", text/plain');
  await expect(api.x.post({ body: { value: { id: 1 } } })).rejects.toThrow(/multiple contentType/);
  expect(transport).not.toHaveBeenCalled();
});

test.each([{ id: 1 }, new Blob(['{"id":1}']), new Uint8Array([123, 125])])(
  'rejects case-sensitive part parameters that native Blob would change: %#',
  async (value) => {
    const { api, transport } = client('application/json; profile=CaseSensitive');
    await expect(api.x.post({ body: { value } })).rejects.toThrow(/media parameters/);
    expect(transport).not.toHaveBeenCalled();
    await api.x.post({ body: { value }, extensions: { body: () => 'custom multipart' } });
    expect(transport).toHaveBeenCalledOnce();
  },
);

test('case-insensitive charset parameters keep their meaning in native multipart', async () => {
  const { api, transport } = client('application/json; CHARSET="UTF-8"; profile=lowercase');
  await api.x.post({ body: { value: { id: 1 } } });
  const part = (transport.mock.calls[0]![0].init.body as FormData).get('value') as Blob;
  expect(part.type).toBe('application/json; charset="utf-8"; profile=lowercase');
  expect(await part.text()).toBe('{"id":1}');
});

test('rejects part parameters that native Blob would discard', async () => {
  const { api, transport } = client('application/json; profile="é"');
  await expect(api.x.post({ body: { value: {} } })).rejects.toThrow(/media parameters/);
  expect(transport).not.toHaveBeenCalled();
});

test.each(['', 'application/json; profile="unterminated', 'application/json,,text/plain'])(
  'invalid Encoding contentType fails compilation: %s',
  (contentType) => {
    expect(() => client(contentType)).toThrow(
      expect.objectContaining({ code: 'METADATA_COMPILE' }),
    );
  },
);
