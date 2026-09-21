import { expect, test, vi } from 'vitest';
import document from './fixtures/conformance.openapi.json' with { type: 'json' };
import type { paths } from './fixtures/conformance-schema.js';
import {
  createClient,
  type OperationInputFor,
  type OperationExtensionsFor,
  type RequestInput,
  type Transport,
} from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

const metadata = compileOpenAPIMetadata(document);
const makeTransport = () =>
  vi.fn<Transport>(
    async (request) =>
      new Response(JSON.stringify({ url: request.url, body: '', contentType: '' }), {
        headers: { 'content-type': 'application/json' },
      }),
  );

test('generated core inputs remain callable with complete strict metadata', async () => {
  const transport = makeTransport();
  const core = createClient<paths>({ baseUrl: 'https://api.test', transport });
  const strict = createStrictClient<paths>({ baseUrl: 'https://api.test', transport, metadata });
  const input = {
    contentType: 'multipart/form-data',
    body: { value: 'hello' },
    extensions: {
      body: ({ body }) => {
        const form = new FormData();
        form.set('value', body.value);
        return form;
      },
    },
  } satisfies OperationInputFor<paths, '/upload', 'post'>;
  for (const api of [core, strict]) {
    const echo = await api.echo('a b').get();
    expect(echo.url).toBe('https://api.test/echo/a%20b');
    await api.upload.post(input);
    expect((transport.mock.lastCall![0].init.body as FormData).get('value')).toBe('hello');
    expect(new Headers(transport.mock.lastCall![0].init.headers).has('content-type')).toBe(false);
    const exact = await api.$path('/echo/{id}/', { id: 'x' }).get();
    expect(exact.url).toBe('https://api.test/echo/x/');
  }
});

test('type-compatible migration deliberately corrects nondefault wire encoding', async () => {
  const transport = makeTransport();
  const options = { baseUrl: 'https://api.test', transport };
  const core = createClient<paths>(options);
  const strict = createStrictClient<paths>({ ...options, metadata });
  const input = { query: { color: ['blue', 'black'] } } satisfies OperationInputFor<
    paths,
    '/search',
    'get'
  >;
  expect((await core.search.get(input)).url).toBe('https://api.test/search?color=blue&color=black');
  expect((await strict.search.get(input)).url).toBe('https://api.test/search?color=blue,black');
});

type LegacyPaths = {
  '/legacy': {
    get: {
      responses: {
        200: { content: { 'application/octet-stream': string } };
        404: { content: { 'text/plain': string } };
      };
    };
  };
};
const legacyMetadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: { '/legacy': { get: {} } },
});
// An explicit text adapter can be deployed before changing client entry points.
const textResponse = {
  response: async (response: Response) => {
    const status = response.status;
    if (status !== 200 && status !== 404) throw new TypeError(`Unexpected status ${status}`);
    return { status, data: await response.text() };
  },
} satisfies OperationExtensionsFor<LegacyPaths, '/legacy', 'get'>;

test.each([200, 404])(
  'a typed text adapter preserves legacy parsing and HTTP results: %s',
  async (status) => {
    const transport: Transport = async () =>
      new Response('legacy text', {
        status,
        headers: { 'content-type': 'application/octet-stream' },
      });
    const options = { baseUrl: 'https://api.test', transport, throwOnError: false as const };
    const core = createClient<LegacyPaths>(options);
    const strict = createStrictClient<LegacyPaths>({ ...options, metadata: legacyMetadata });
    for (const api of [core, strict]) {
      const result = await api.legacy.get({ extensions: textResponse });
      expect(result.status).toBe(status);
      expect(result.data).toBe('legacy text');
      expect(result.ok).toBe(status === 200);
    }
  },
);

type Runtime = { $path(path: string): { get(input?: RequestInput): Promise<unknown> } };
test('null omission and extra inputs remain explicit migration boundaries', async () => {
  const transport = makeTransport();
  const options = { baseUrl: 'https://api.test', transport };
  const core = createClient(options) as unknown as Runtime;
  const strict = createStrictClient({
    ...options,
    metadata: compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/nullable': {
          get: { parameters: [{ name: 'q', in: 'query', schema: { type: ['string', 'null'] } }] },
        },
      },
    }),
  }) as unknown as Runtime;
  await core.$path('/nullable').get({ query: { q: null } });
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/nullable');
  await strict.$path('/nullable').get({ query: { q: null } });
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/nullable?q=null');
  await strict.$path('/nullable').get({ query: { q: undefined } });
  expect(transport.mock.lastCall![0].url).toBe('https://api.test/nullable');
  transport.mockClear();
  await expect(strict.$path('/nullable').get({ query: { extra: undefined } })).rejects.toThrow(
    /does not declare/,
  );
  expect(transport).not.toHaveBeenCalled();
});
