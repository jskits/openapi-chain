import { describe, expect, test } from 'vitest';
import createFetchClient from 'openapi-fetch';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import {
  BASE_URL,
  capture,
  operationDocument,
  wireCases,
  type Input,
  type Wire,
  type WireCase,
} from './fixtures/wire-cases.js';

// Evidence for docs/wire-comparison.md. `expected` follows the OpenAPI 3.1.1 Parameter/Encoding
// rules; `openapiFetch` pins what openapi-fetch 0.17.0 actually sends for the same schema and
// input. Update the document whenever a pinned openapi-fetch upgrade changes these requests.

type LooseOperation = (input?: Input & { contentType?: string }) => Promise<unknown>;
type LooseStrict = {
  $path(template: string, params?: Record<string, unknown>): Record<string, LooseOperation>;
};
type LooseFetch = Record<'GET' | 'POST', (path: string, init: object) => Promise<unknown>>;

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
