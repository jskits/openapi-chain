import { expect, test, vi } from 'vitest';
import {
  createClient,
  type RequestInput,
  type Transport,
  type TransportRequest,
} from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': FormData } };
      responses: { 204: { content: never } };
    };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: { '/upload': { post: { requestBody: { content: { 'multipart/form-data': {} } } } } },
});

test.each([false, true])(
  'FormData overrides inherited media headers, strict=%s',
  async (strict) => {
    let calls = 0;
    const transport = async ({ url, init }: TransportRequest) => {
      const request = new Request(url, init);
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      expect((await request.formData()).get('name')).toBe('中文😀');
      calls++;
      return new Response(null, { status: 204 });
    };
    const options = {
      baseUrl: 'https://example.test',
      headers: { 'content-type': 'application/json' },
      transport,
    };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    const body = new FormData();
    body.set('name', '中文😀');
    await api.upload.post({ contentType: 'multipart/form-data', body });
    await api.upload.post({
      contentType: 'multipart/form-data',
      body,
      init: { headers: { 'content-type': 'multipart/form-data; boundary=wrong' } },
    });
    expect(calls).toBe(2);
  },
);

test.each([false, true])('rejects incompatible FormData media, strict=%s', async (strict) => {
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const options = { baseUrl: 'https://example.test', transport };
  const api = (strict
    ? createStrictClient({
        ...options,
        metadata: compileOpenAPIMetadata({
          openapi: '3.1.0',
          paths: { '/upload': { post: { requestBody: { content: { '*/*': {} } } } } },
        }),
      })
    : createClient(options)) as unknown as {
    upload: { post(input: RequestInput): Promise<unknown> };
  };
  const body = new FormData();
  body.set('name', 'value');
  for (const contentType of [
    'text/plain',
    'application/octet-stream',
    'application/json',
    'multipart/form-data; profile=A',
    'multipart/form-data; boundary=manual',
  ]) {
    await expect(api.upload.post({ body, contentType })).rejects.toMatchObject({
      code: 'SERIALIZATION',
    });
    await expect(
      api.upload.post({ body: 'custom input', contentType, extensions: { body: () => body } }),
    ).rejects.toMatchObject({ code: 'SERIALIZATION' });
  }
  await expect(
    api.upload.post({ body: { name: 'value' }, contentType: 'multipart/form-data; profile=A' }),
  ).rejects.toMatchObject({ code: 'SERIALIZATION' });
  expect(transport).not.toHaveBeenCalled();
  await api.upload.post({
    body,
    contentType: 'application/json',
    extensions: { body: () => JSON.stringify(Object.fromEntries(body)) },
  });
  expect(transport.mock.calls[0]![0].init.body).toBe('{"name":"value"}');
  await api.upload.post({
    body: { name: 'value' },
    contentType: 'multipart/form-data; boundary=manual',
    extensions: { body: () => '--manual--\r\n' },
  });
  expect(new Headers(transport.mock.calls[1]![0].init.headers).get('content-type')).toBe(
    'multipart/form-data; boundary=manual',
  );
});
