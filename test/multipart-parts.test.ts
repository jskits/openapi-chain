import { expect, test } from 'vitest';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Paths = {
  '/upload': {
    post: {
      requestBody: { content: { 'multipart/form-data': { value: unknown } } };
      responses: { 204: { content: never } };
    };
  };
};

async function multipart(
  value: unknown,
  contentType: string,
  inspect: (request: Request) => Promise<void>,
) {
  const metadata = compileOpenAPIMetadata({
    openapi: '3.1.1',
    paths: {
      '/upload': {
        post: {
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { value: {} } },
                encoding: { value: { contentType } },
              },
            },
          },
        },
      },
    },
  });
  const api = createStrictClient<Paths>({
    baseUrl: 'https://example.test',
    metadata,
    transport: async ({ url, init }) => {
      await inspect(new Request(url, init));
      return new Response(null, { status: 204 });
    },
  });
  await api.upload.post({ body: { value } });
}

test.each(['text/csv', 'application/octet-stream', ''])(
  'preserves filenames when replacing a File media type %s',
  async (type) => {
    const files = [
      new File(['first'], 'report.csv', { type }),
      new File(['second'], 'résumé.csv', { type }),
    ];
    await multipart(files, 'application/octet-stream', async (request) => {
      const parts = (await request.formData()).getAll('value') as File[];
      expect(parts.map((part) => part.name)).toEqual(files.map((file) => file.name));
      expect(parts.map((part) => part.type)).toEqual([
        'application/octet-stream',
        'application/octet-stream',
      ]);
      expect(await Promise.all(parts.map((part) => part.text()))).toEqual(['first', 'second']);
    });
  },
);
