import { describe, expect, test } from 'vitest';
import createFetchClient, { wrapAsPathBasedClient, type Middleware } from 'openapi-fetch';
import { withOpenAPISerialization } from '../packages/core/src/openapi-fetch.js';
import { createRequestSerializer } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { OpenAPIChainError } from '../packages/core/src/errors.js';
import {
  BASE_URL,
  capture,
  operationDocument,
  wireCases,
  type Wire,
  type WireCase,
} from './fixtures/wire-cases.js';

type LooseCall = (path: string, init?: object) => Promise<{ data?: unknown; error?: unknown }>;
type LooseClient = Record<'GET' | 'POST', LooseCall> & {
  request(method: string, path: string, init?: object): Promise<{ data?: unknown }>;
  use(...middleware: Middleware[]): void;
};

const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: {
    '/items/{id}': {
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, style: 'label', schema: { type: 'array' } },
          { name: 'tags', in: 'query', explode: false, schema: { type: 'array' } },
          { name: 'X-Trace', in: 'header', schema: { type: 'array' } },
        ],
        responses: { 200: { description: 'ok' } },
      },
    },
    '/items': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': { schema: { type: 'object' } },
            'multipart/form-data': { schema: { type: 'object' } },
          },
        },
        responses: { 201: { description: 'created' } },
      },
    },
  },
});

function wrapped(respond = () => new Response(null, { status: 204 }), options = {}) {
  const sent: Request[] = [];
  const client = createFetchClient({
    baseUrl: BASE_URL,
    fetch: async (request: Request) => {
      sent.push(request);
      return respond();
    },
    ...options,
  });
  return { client: withOpenAPISerialization(client, { metadata }) as unknown as LooseClient, sent };
}

async function sendAdapted(entry: WireCase): Promise<Wire> {
  const { body, ...params } = entry.input;
  const sent: Request[] = [];
  const client = withOpenAPISerialization(
    createFetchClient({
      baseUrl: BASE_URL,
      fetch: async (request: Request) => {
        sent.push(request);
        return new Response(null, { status: 204 });
      },
    }),
    { metadata: compileOpenAPIMetadata(operationDocument(entry)) },
  ) as unknown as LooseClient;
  await client[entry.method === 'get' ? 'GET' : 'POST'](entry.template, {
    params,
    ...(body !== undefined && { body }),
  });
  return capture(sent[0]!);
}

describe.each(wireCases)('$id', (entry) => {
  test('the adapted openapi-fetch client sends the OpenAPI-specified request', async () => {
    expect(await sendAdapted(entry)).toEqual(entry.expected);
  });
});

test('responses, middleware and the openapi-fetch result shape are unchanged', async () => {
  const { client, sent } = wrapped(() => Response.json({ ok: true }));
  const seen: string[] = [];
  client.use({
    onRequest: ({ request, schemaPath }) => {
      seen.push(`${schemaPath} ${new URL(request.url).pathname}`);
    },
  });
  const result = await client.GET('/items/{id}', {
    params: { path: { id: ['3', '4'] }, query: { tags: ['a', 'b'] } },
  });
  expect(result.data).toEqual({ ok: true });
  expect(result.error).toBeUndefined();
  expect(seen).toEqual(['/items/{id} /items/.3,4']);
  expect(new URL(sent[0]!.url).search).toBe('?tags=a,b');

  const failed = wrapped(() => Response.json({ message: 'missing' }, { status: 404 })).client;
  const error = await failed.GET('/items/{id}', { params: { path: { id: ['1'] } } });
  expect(error.data).toBeUndefined();
  expect(error.error).toEqual({ message: 'missing' });
});

test('path-based clients and request() use the same serialization', async () => {
  const { client, sent } = wrapped();
  const pathBased = wrapAsPathBasedClient(client as never) as unknown as Record<
    string,
    { GET: (init: object) => Promise<unknown> }
  >;
  await pathBased['/items/{id}']!.GET({ params: { path: { id: ['5', '6'] } } });
  await client.request('get', '/items/{id}', { params: { path: { id: ['7'] } } });
  expect(sent.map((request) => new URL(request.url).pathname)).toEqual([
    '/items/.5,6',
    '/items/.7',
  ]);
});

test('call headers override serialized parameters and body media comes from the document', async () => {
  const { client, sent } = wrapped(undefined, { headers: { 'Content-Type': 'text/plain' } });
  await client.GET('/items/{id}', {
    params: { path: { id: ['1'] }, header: { 'X-Trace': ['a', 'b'] } },
  });
  await client.GET('/items/{id}', {
    params: { path: { id: ['1'] }, header: { 'X-Trace': ['a', 'b'] } },
    headers: { 'x-trace': 'override' },
  });
  await client.POST('/items', {
    body: { name: 'Ada' },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  await client.POST('/items', {
    body: { name: 'Ada' },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  expect(sent[0]!.headers.get('x-trace')).toBe('a,b');
  // A bodyless call keeps the client's configured headers.
  expect(sent[0]!.headers.get('content-type')).toBe('text/plain');
  expect(sent[1]!.headers.get('x-trace')).toBe('override');
  expect(sent[2]!.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  expect(await sent[2]!.text()).toBe('name=Ada');
  expect(sent[3]!.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
  expect((await sent[3]!.formData()).get('name')).toBe('Ada');
});

test('serialization failures reject before transport with operation context', async () => {
  const { client, sent } = wrapped();
  const call = client.POST('/items', { body: { name: 'Ada' } });
  await expect(call).rejects.toBeInstanceOf(OpenAPIChainError);
  await expect(call).rejects.toMatchObject({
    code: 'SERIALIZATION',
    method: 'POST',
    pathTemplate: '/items',
  });
  expect(sent).toHaveLength(0);
});

test('createRequestSerializer returns wire parts for any HTTP client', () => {
  const serialize = createRequestSerializer(metadata);
  const request = serialize({
    method: 'get',
    path: '/items/{id}',
    params: { path: { id: ['3'] }, query: { tags: ['a', 'b'] }, header: { 'X-Trace': ['x'] } },
  });
  expect(request.path).toBe('/items/.3');
  expect(request.query).toBe('tags=a,b');
  expect([...request.headers]).toEqual([['x-trace', 'x']]);
  expect(request.body).toBeUndefined();
  expect(() => serialize({ method: 'get', path: '/items/{id}' })).toThrow(OpenAPIChainError);
});
