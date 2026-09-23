import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import { createStrictClient } from '../src/strict.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { '*/*': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
};
const broad = { schema: { type: 'object', properties: { value: { type: 'object' } } } };
const narrow = { schema: { type: 'object', additionalProperties: { type: 'string' } } };
test.each(['multipart/form-data', 'Multipart/Form-Data; charset=utf-8', 'multipart/*'])(
  'most-specific declaration shadows broader rules even without metadata: %s',
  async (specific) => {
    for (const reverse of [false, true]) {
      const entries = [
        ['*/*', broad],
        [specific, narrow],
      ] as const;
      const metadata = compileOpenAPIMetadata({
        openapi: '3.1.1',
        paths: {
          '/upload': {
            post: {
              requestBody: {
                content: Object.fromEntries(reverse ? [...entries].reverse() : entries),
              },
            },
          },
        },
      });
      const api = createStrictClient<Paths>({
        baseUrl: 'https://example.test',
        metadata,
        transport: async ({ url, init }) => {
          const request = new Request(url, init);
          expect(await request.clone().text()).not.toContain('filename=');
          expect((await request.formData()).get('value')).toBe('hello');
          return new Response(null, { status: 204 });
        },
      });
      await api.upload.post({
        contentType: specific.includes(';')
          ? 'multipart/form-data; charset=utf-8'
          : 'multipart/form-data',
        body: { value: 'hello' },
      });
    }
  },
);
