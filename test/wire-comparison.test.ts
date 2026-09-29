import { describe, expect, test } from 'vitest';
import createFetchClient from 'openapi-fetch';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

// Evidence for docs/wire-comparison.md. `expected` follows the OpenAPI 3.1.1 Parameter/Encoding
// rules; `openapiFetch` pins what openapi-fetch 0.17.0 actually sends for the same schema and
// input. Update the document whenever a pinned openapi-fetch upgrade changes these requests.

type Part = { name: string; value: string; type?: string };
type Wire = { request: string; headers?: Record<string, string>; body?: string; parts?: Part[] };
type Input = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  header?: Record<string, unknown>;
  cookie?: Record<string, unknown>;
  body?: unknown;
};
type WireCase = {
  id: string;
  method: 'get' | 'post';
  template: string;
  parameters?: object[];
  requestBody?: object;
  input: Input;
  /** Content-Type an openapi-fetch user would add; generated types do not supply one. */
  fetchHeaders?: Record<string, string>;
  expected: Wire;
  openapiFetch: Wire;
  verdict: 'identical' | 'equivalent' | 'different';
};
type LooseOperation = (input?: Input & { contentType?: string }) => Promise<unknown>;
type LooseStrict = {
  $path(template: string, params?: Record<string, unknown>): Record<string, LooseOperation>;
};
type LooseFetch = Record<'GET' | 'POST', (path: string, init: object) => Promise<unknown>>;

const BASE_URL = 'https://api.example.test';
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const strings = { type: 'array', items: { type: 'string' } };
const colors = ['blue', 'black', 'brown'];
const rgb = { R: 100, G: 200, B: 150 };
const person = { role: 'admin', firstName: 'Alex' };

const wireCases: WireCase[] = [
  {
    id: 'query-array-default',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'color', in: 'query', schema: strings }],
    input: { path: { id: '1' }, query: { color: colors } },
    expected: { request: 'GET /items/1?color=blue&color=black&color=brown' },
    openapiFetch: { request: 'GET /items/1?color=blue&color=black&color=brown' },
    verdict: 'identical',
  },
  {
    id: 'query-object-default',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'color', in: 'query', schema: { type: 'object' } }],
    input: { path: { id: '1' }, query: { color: rgb } },
    expected: { request: 'GET /items/1?R=100&G=200&B=150' },
    openapiFetch: { request: 'GET /items/1?color[R]=100&color[G]=200&color[B]=150' },
    verdict: 'different',
  },
  {
    id: 'query-explode-false',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'color', in: 'query', explode: false, schema: strings }],
    input: { path: { id: '1' }, query: { color: colors } },
    expected: { request: 'GET /items/1?color=blue,black,brown' },
    openapiFetch: { request: 'GET /items/1?color=blue&color=black&color=brown' },
    verdict: 'different',
  },
  {
    id: 'query-mixed-explode',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      { name: 'tags', in: 'query', explode: false, schema: strings },
      { name: 'ids', in: 'query', schema: strings },
    ],
    input: { path: { id: '1' }, query: { tags: ['a', 'b'], ids: ['1', '2'] } },
    expected: { request: 'GET /items/1?tags=a,b&ids=1&ids=2' },
    openapiFetch: { request: 'GET /items/1?tags=a&tags=b&ids=1&ids=2' },
    verdict: 'different',
  },
  {
    id: 'query-pipe-delimited',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      { name: 'color', in: 'query', style: 'pipeDelimited', explode: false, schema: strings },
    ],
    input: { path: { id: '1' }, query: { color: colors } },
    expected: { request: 'GET /items/1?color=blue%7Cblack%7Cbrown' },
    openapiFetch: { request: 'GET /items/1?color=blue&color=black&color=brown' },
    verdict: 'different',
  },
  {
    id: 'query-space-delimited',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      { name: 'color', in: 'query', style: 'spaceDelimited', explode: false, schema: strings },
    ],
    input: { path: { id: '1' }, query: { color: colors } },
    expected: { request: 'GET /items/1?color=blue%20black%20brown' },
    openapiFetch: { request: 'GET /items/1?color=blue&color=black&color=brown' },
    verdict: 'different',
  },
  {
    id: 'query-deep-object',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      { name: 'color', in: 'query', style: 'deepObject', schema: { type: 'object' } },
    ],
    input: { path: { id: '1' }, query: { color: rgb } },
    expected: { request: 'GET /items/1?color%5BR%5D=100&color%5BG%5D=200&color%5BB%5D=150' },
    openapiFetch: { request: 'GET /items/1?color[R]=100&color[G]=200&color[B]=150' },
    verdict: 'equivalent',
  },
  {
    id: 'query-allow-reserved',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      { name: 'next', in: 'query', allowReserved: true, schema: { type: 'string' } },
    ],
    input: { path: { id: '1' }, query: { next: '/a/b?c' } },
    expected: { request: 'GET /items/1?next=/a/b?c' },
    openapiFetch: { request: 'GET /items/1?next=%2Fa%2Fb%3Fc' },
    verdict: 'equivalent',
  },
  {
    id: 'query-content-json',
    method: 'get',
    template: '/items/{id}',
    parameters: [
      id,
      {
        name: 'filter',
        in: 'query',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    ],
    input: { path: { id: '1' }, query: { filter: { status: 'open', page: 2 } } },
    expected: {
      request: 'GET /items/1?filter=%7B%22status%22%3A%22open%22%2C%22page%22%3A2%7D',
    },
    openapiFetch: { request: 'GET /items/1?filter[status]=open&filter[page]=2' },
    verdict: 'different',
  },
  {
    id: 'path-label',
    method: 'get',
    template: '/items/{id}',
    parameters: [{ ...id, style: 'label', schema: strings }],
    input: { path: { id: ['3', '4', '5'] } },
    expected: { request: 'GET /items/.3,4,5' },
    openapiFetch: { request: 'GET /items/3,4,5' },
    verdict: 'different',
  },
  {
    id: 'path-matrix-explode',
    method: 'get',
    template: '/items/{id}',
    parameters: [{ ...id, style: 'matrix', explode: true, schema: strings }],
    input: { path: { id: ['3', '4'] } },
    expected: { request: 'GET /items/;id=3;id=4' },
    openapiFetch: { request: 'GET /items/3,4' },
    verdict: 'different',
  },
  {
    id: 'path-object-explode',
    method: 'get',
    template: '/items/{id}',
    parameters: [{ ...id, explode: true, schema: { type: 'object' } }],
    input: { path: { id: person } },
    expected: { request: 'GET /items/role=admin,firstName=Alex' },
    openapiFetch: { request: 'GET /items/role,admin,firstName,Alex' },
    verdict: 'different',
  },
  {
    id: 'header-array',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'X-Ids', in: 'header', schema: strings }],
    input: { path: { id: '1' }, header: { 'X-Ids': ['3', '4', '5'] } },
    expected: { request: 'GET /items/1', headers: { 'x-ids': '3,4,5' } },
    openapiFetch: { request: 'GET /items/1', headers: { 'x-ids': '3, 4, 5' } },
    verdict: 'equivalent',
  },
  {
    id: 'header-object',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'X-Filter', in: 'header', explode: true, schema: { type: 'object' } }],
    input: { path: { id: '1' }, header: { 'X-Filter': person } },
    expected: { request: 'GET /items/1', headers: { 'x-filter': 'role=admin,firstName=Alex' } },
    openapiFetch: { request: 'GET /items/1', headers: { 'x-filter': '[object Object]' } },
    verdict: 'different',
  },
  {
    id: 'cookie',
    method: 'get',
    template: '/items/{id}',
    parameters: [id, { name: 'session', in: 'cookie', schema: { type: 'string' } }],
    input: { path: { id: '1' }, cookie: { session: 'abc' } },
    expected: { request: 'GET /items/1', headers: { cookie: 'session=abc' } },
    openapiFetch: { request: 'GET /items/1' },
    verdict: 'different',
  },
  {
    id: 'body-text',
    method: 'post',
    template: '/items',
    requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } },
    input: { body: 'hello' },
    fetchHeaders: { 'Content-Type': 'text/plain' },
    expected: { request: 'POST /items', headers: { 'content-type': 'text/plain' }, body: 'hello' },
    openapiFetch: {
      request: 'POST /items',
      headers: { 'content-type': 'text/plain' },
      body: '"hello"',
    },
    verdict: 'different',
  },
  {
    id: 'body-merge-patch',
    method: 'post',
    template: '/items',
    requestBody: { content: { 'application/merge-patch+json': { schema: { type: 'object' } } } },
    input: { body: { name: null } },
    expected: {
      request: 'POST /items',
      headers: { 'content-type': 'application/merge-patch+json' },
      body: '{"name":null}',
    },
    openapiFetch: {
      request: 'POST /items',
      headers: { 'content-type': 'application/json' },
      body: '{"name":null}',
    },
    verdict: 'different',
  },
  {
    id: 'body-form-default',
    method: 'post',
    template: '/items',
    requestBody: {
      content: {
        'application/x-www-form-urlencoded': {
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    },
    input: { body: { name: 'Ada Lovelace' } },
    expected: {
      request: 'POST /items',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=Ada+Lovelace',
    },
    openapiFetch: {
      request: 'POST /items',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Ada Lovelace"}',
    },
    verdict: 'different',
  },
  {
    id: 'body-form-encoding',
    method: 'post',
    template: '/items',
    requestBody: {
      content: {
        'application/x-www-form-urlencoded': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              tags: strings,
              address: { type: 'object', properties: { city: { type: 'string' } } },
            },
          },
          encoding: { address: { style: 'deepObject', explode: true } },
        },
      },
    },
    input: { body: { name: 'Ada', tags: ['a', 'b'], address: { city: 'Paris' } } },
    fetchHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
    expected: {
      request: 'POST /items',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=Ada&tags=a&tags=b&address%5Bcity%5D=Paris',
    },
    openapiFetch: {
      request: 'POST /items',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=Ada&tags=a%2Cb&address=%5Bobject+Object%5D',
    },
    verdict: 'different',
  },
  {
    id: 'body-multipart-encoding',
    method: 'post',
    template: '/items',
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              metadata: { type: 'object', properties: { title: { type: 'string' } } },
              tags: strings,
              file: { type: 'string', contentMediaType: 'image/png' },
            },
          },
          encoding: { file: { contentType: 'image/png' } },
        },
      },
    },
    input: {
      body: {
        metadata: { title: 'Cat' },
        tags: ['a', 'b'],
        file: new Blob(['PNG'], { type: 'image/png' }),
      },
    },
    fetchHeaders: { 'Content-Type': 'multipart/form-data' },
    expected: {
      request: 'POST /items',
      headers: { 'content-type': 'multipart/form-data' },
      parts: [
        { name: 'metadata', type: 'application/json', value: '{"title":"Cat"}' },
        { name: 'tags', value: 'a' },
        { name: 'tags', value: 'b' },
        { name: 'file', type: 'image/png', value: 'PNG' },
      ],
    },
    openapiFetch: {
      request: 'POST /items',
      headers: { 'content-type': 'multipart/form-data' },
      body: '{"metadata":{"title":"Cat"},"tags":["a","b"],"file":{}}',
    },
    verdict: 'different',
  },
];

async function capture(request: Request): Promise<Wire> {
  const url = new URL(request.url);
  const wire: Wire = { request: `${request.method} ${url.pathname}${url.search}` };
  const contentType = request.headers.get('content-type') ?? '';
  const multipart = contentType.startsWith('multipart/form-data');
  const headers = [...request.headers].map(([name, value]): [string, string] =>
    // The generated boundary is random; the media type is the comparable part.
    name === 'content-type' && multipart ? [name, 'multipart/form-data'] : [name, value],
  );
  if (headers.length) wire.headers = Object.fromEntries(headers);
  if (!request.body) return wire;
  if (multipart && contentType.includes('boundary=')) {
    wire.parts = [];
    for (const [name, value] of await request.formData())
      wire.parts.push(
        typeof value === 'string'
          ? { name, value }
          : { name, type: value.type, value: await value.text() },
      );
  } else wire.body = await request.text();
  return wire;
}

function operationDocument(entry: WireCase) {
  const operation = {
    ...(entry.parameters && { parameters: entry.parameters }),
    ...(entry.requestBody && { requestBody: { required: true, ...entry.requestBody } }),
    responses: { 204: { description: 'No content' } },
  };
  return {
    openapi: '3.1.0',
    info: { title: 'Wire comparison', version: '1' },
    paths: { [entry.template]: { [entry.method]: operation } },
  } as unknown as Parameters<typeof compileOpenAPIMetadata>[0];
}

async function sendStrict(entry: WireCase): Promise<Wire> {
  let sent: Request | undefined;
  const api = createStrictClient({
    baseUrl: BASE_URL,
    metadata: compileOpenAPIMetadata(operationDocument(entry)),
    transport: async ({ url, init }) => {
      sent = new Request(url, init);
      return new Response(null, { status: 204 });
    },
  }) as unknown as LooseStrict;
  const { path, ...input } = entry.input;
  await api.$path(entry.template, path)[entry.method]!(input);
  return capture(sent!);
}

async function sendOpenapiFetch(entry: WireCase): Promise<Wire> {
  let sent: Request | undefined;
  const client = createFetchClient({
    baseUrl: BASE_URL,
    fetch: async (request: Request) => {
      sent = request;
      return new Response(null, { status: 204 });
    },
  }) as unknown as LooseFetch;
  const { body, ...params } = entry.input;
  await client[entry.method === 'get' ? 'GET' : 'POST'](entry.template, {
    params,
    ...(body !== undefined && { body }),
    ...(entry.fetchHeaders && { headers: entry.fetchHeaders }),
  });
  return capture(sent!);
}

/** Percent-decoding and HTTP list whitespace do not change what a server receives. */
function normalize(wire: Wire): Wire {
  return {
    ...wire,
    request: decodeURIComponent(wire.request),
    ...(wire.headers && {
      headers: Object.fromEntries(
        Object.entries(wire.headers).map(([name, value]) => [name, value.replace(/\s*,\s*/g, ',')]),
      ),
    }),
    ...(wire.body !== undefined && { body: decodeURIComponent(wire.body) }),
  };
}

function verdict(expected: Wire, actual: Wire): WireCase['verdict'] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return 'identical';
  return JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual))
    ? 'equivalent'
    : 'different';
}

describe.each(wireCases)('$id', (entry) => {
  test('openapi-chain strict sends the OpenAPI-specified request', async () => {
    expect(await sendStrict(entry)).toEqual(entry.expected);
  });
  test('openapi-fetch 0.17.0 sends the recorded request', async () => {
    expect(await sendOpenapiFetch(entry)).toEqual(entry.openapiFetch);
  });
  test('recorded verdict matches the comparison', () => {
    expect(verdict(entry.expected, entry.openapiFetch)).toBe(entry.verdict);
  });
});
