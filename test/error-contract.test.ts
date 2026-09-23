import { expect, test } from 'vitest';
import { createClient, HttpError, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
type Paths = {
  '/x': {
    get: {
      responses: {
        200: { content: { 'application/json': { ok: true } } };
        400: { content: { 'application/json': { error: string } } };
      };
    };
  };
};
const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/x': { get: {} } } });
test.each([false, true])(
  'HTTP mode does not swallow parsing, abort or transport failures, strict=%s',
  async (strict) => {
    const make = (transport: Transport, throwOnError: boolean) => {
      const options = { baseUrl: 'https://example.test', transport, throwOnError };
      return strict
        ? createStrictClient<Paths>({ ...options, metadata })
        : createClient<Paths>(options);
    };
    for (const throwOnError of [false, true]) {
      await expect(
        make(
          async () =>
            new Response('bad json', {
              status: 400,
              headers: { 'content-type': 'application/json' },
            }),
          throwOnError,
        ).x.get(),
      ).rejects.toBeInstanceOf(SyntaxError);
      for (const failure of [
        new TypeError('offline'),
        new DOMException('cancelled', 'AbortError'),
      ]) {
        await expect(
          make(async () => {
            throw failure;
          }, throwOnError).x.get(),
        ).rejects.toBe(failure);
      }
    }
    const transport: Transport = async () =>
      new Response('{"error":"invalid"}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    await expect(make(transport, false).x.get()).resolves.toMatchObject({
      ok: false,
      status: 400,
      data: { error: 'invalid' },
    });
    await expect(make(transport, true).x.get()).rejects.toBeInstanceOf(HttpError);
  },
);
