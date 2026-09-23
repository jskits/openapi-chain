import { expect, test, vi } from 'vitest';
import { createClient, HttpError } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Paths = { '/x': { get: { responses: { 200: { content: { 'text/plain': string } } } } } };
const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/x': { get: {} } } });

for (const strict of [false, true])
  for (const throwOnError of [false, true])
    test.each(['opaque', 'opaqueredirect', 'error'])(
      `rejects unreadable %s responses before parsing, strict=${strict}, throwOnError=${throwOnError}`,
      async (type) => {
        for (const custom of [false, true]) {
          const response = Response.error();
          Object.defineProperty(response, 'type', { value: type });
          const text = vi.spyOn(response, 'text');
          const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
          const parser = vi.fn<() => { status: 200; data: string }>(() => ({
            status: 200,
            data: 'unreadable',
          }));
          const options = {
            baseUrl: 'https://example.test',
            throwOnError,
            transport: async () => response,
          };
          const api = strict
            ? createStrictClient<Paths>({ ...options, metadata })
            : createClient<Paths>(options);
          const error = await api.x
            .get(custom ? { extensions: { response: parser } } : {})
            .catch((error: unknown) => error);
          expect(error).toBeInstanceOf(TypeError);
          expect(error).not.toBeInstanceOf(HttpError);
          expect(error).toHaveProperty('message', 'Response status 0');
          expect(parser).not.toHaveBeenCalled();
          expect(text).not.toHaveBeenCalled();
          expect(arrayBuffer).not.toHaveBeenCalled();
        }
      },
    );
