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

test.each([
  'text/plain; charset=UTF-8',
  'text/plain; charset="utf-8"',
  'application/json; charset=utf-8',
])('preserves declared media parameters and UTF-8 bytes for %s', async (contentType) => {
  await multipart('café😀', contentType, async (request) => {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const wire = new TextDecoder().decode(bytes);
    expect(wire).toContain(`Content-Type: ${contentType.toLowerCase()}\r\n`);
    expect(Buffer.from(bytes).includes(Buffer.from('café😀', 'utf8'))).toBe(true);
  });
});

test.each([
  'text/plain; charset=iso-8859-1',
  'text/html; charset="UTF-16"',
  'application/json; charset=ascii',
])('rejects unsupported generated text charset before transport: %s', async (contentType) => {
  let calls = 0;
  await expect(
    multipart('café', contentType, async () => {
      calls++;
    }),
  ).rejects.toThrow(/charset.*not supported/);
  expect(calls).toBe(0);
});

test('pre-encoded parts keep their bytes with a non-UTF-8 charset', async () => {
  await multipart(
    new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
    'text/plain; charset=iso-8859-1',
    async (request) => {
      const bytes = Buffer.from(await request.arrayBuffer());
      expect(bytes.includes(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe(true);
      expect(bytes.toString()).toContain('Content-Type: text/plain; charset=iso-8859-1');
    },
  );
});
