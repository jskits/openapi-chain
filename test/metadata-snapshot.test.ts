import { snapshotMetadata } from '../packages/core/src/metadata-contract.js';
import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { CompiledOpenAPIMetadata, RequestInput } from '../packages/core/src/index.js';

test('JSON-decoded metadata and its options can change without affecting an existing strict client', async () => {
  const metadata = JSON.parse(
    JSON.stringify(
      compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: { '/x': { post: { requestBody: { content: { 'application/json': {} } } } } },
      }),
    ),
  ) as CompiledOpenAPIMetadata;
  const requests: unknown[] = [];
  const options = {
    baseUrl: 'https://api.test',
    metadata,
    transport: async (request: { init: RequestInit }) => {
      requests.push(request.init.body);
      return new Response(null, { status: 204 });
    },
  };
  const api = createStrictClient(options) as unknown as {
    x: { post(input: RequestInput): Promise<unknown> };
  };
  const operation = metadata.operations['/x']!.post!;
  operation.requestBody!.mediaTypes = ['text/plain'];
  Reflect.deleteProperty(metadata.operations, '/x');
  Reflect.set(metadata, 'complete', false);
  options.metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: {} });
  await api.x.post({ body: { stable: true } });
  await api.x.post({ body: {}, extensions: { body: () => '{}' } });
  expect(requests).toEqual(['{"stable":true}', '{}']);
});

test('the private metadata snapshot is recursively frozen', () => {
  const snapshot = snapshotMetadata(
    compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: { '/x': { post: { requestBody: { content: { 'application/json': {} } } } } },
    }),
  );
  const operation = snapshot.operations['/x']!.post!;
  expect(Object.isFrozen(operation)).toBe(true);
  expect(Object.isFrozen(operation.requestBody!.mediaTypes)).toBe(true);
  expect(Reflect.set(operation.requestBody!, 'required', true)).toBe(false);
});

test.each([false, true])(
  'additional form fields never inherit serialization metadata, JSON-decoded=%s',
  async (decoded) => {
    const mediaTypes = ['multipart/form-data', 'application/x-www-form-urlencoded'];
    const compiled = compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: Object.fromEntries(
                mediaTypes.map((media) => [
                  media,
                  {
                    schema: {
                      type: 'object',
                      properties: { known: { type: 'string' } },
                      additionalProperties: { type: 'string' },
                    },
                    encoding: { known: { contentType: 'text/plain' } },
                  },
                ]),
              ),
            },
          },
        },
      },
    });
    const metadata = decoded
      ? (JSON.parse(JSON.stringify(compiled)) as CompiledOpenAPIMetadata)
      : compiled;
    const received: [string, FormDataEntryValue][][] = [];
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata,
      transport: async ({ url, init }) => {
        received.push([...(await new Request(url, init).formData())]);
        return new Response(null, { status: 204 });
      },
    }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
    const body = { known: 'declared', constructor: 'a', toString: 'b', ['__proto__']: 'c' };
    for (const contentType of mediaTypes) await api.x.post({ body, contentType });
    expect(received).toEqual(mediaTypes.map(() => Object.entries(body)));
  },
);
