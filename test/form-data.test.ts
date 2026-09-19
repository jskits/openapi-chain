import { expect, test } from 'vitest';
import { createClient, type TransportRequest } from '../src/index.js';
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
