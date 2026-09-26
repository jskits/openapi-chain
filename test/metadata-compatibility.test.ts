import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createStrictClient } from '../packages/core/src/strict.js';
import { OpenAPIChainError, type CompiledOpenAPIMetadata } from '../packages/core/src/index.js';

type Echo = { path: string; query?: string; header?: string | null; body?: string };
type LegacyPaths = {
  '/records/{id}': {
    parameters: {
      path: { id: string };
      query?: { tags?: string[] };
      header?: { 'x-flags'?: string[] };
    };
    get: { responses: { 200: { content: { 'application/json': Echo } } } };
  };
  '/filters': {
    post: {
      requestBody: {
        content: { 'application/x-www-form-urlencoded': { term: string; labels: string[] } };
      };
      responses: { 200: { content: { 'application/json': Echo } } };
    };
  };
  '/uploads': {
    post: {
      requestBody: { content: { 'multipart/form-data': { note: string; attachment: File } } };
      responses: { 200: { content: { 'application/json': Echo } } };
    };
  };
};

// This artifact was compiled by the published 0.5.2 package. Do not compile it in this test.
const bytes = readFileSync(new URL('./fixtures/metadata-v1-0.5.2/metadata.json', import.meta.url));
const artifact = JSON.parse(bytes.toString('utf8')) as CompiledOpenAPIMetadata;

test('published 0.5.2 metadata v1 artifact remains readable with path, query and header wire semantics', async () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'c4cf84c44ea23b0ca2fd61d1bd1c75e40b00bcab62e61bfd55020612d54ab0c0',
  );
  expect(artifact.version).toBe(1);
  const seen: Echo[] = [];
  const api = createStrictClient<LegacyPaths>({
    baseUrl: 'https://legacy.test/api',
    metadata: artifact,
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      const parsed = new URL(request.url);
      const wire = {
        path: parsed.pathname,
        query: parsed.search,
        header: request.headers.get('x-flags'),
      };
      seen.push(wire);
      return Response.json(wire);
    },
  });
  const input = { query: { tags: ['red', 'blue'] }, header: { 'x-flags': ['fast', 'quiet'] } };
  const expected = {
    path: '/api/records/a%2Fb',
    query: '?tags=red,blue',
    header: 'fast,quiet',
  };
  expect(await api.records('a/b').get(input)).toEqual(expected);
  expect(await api.$path('/records/{id}', { id: 'a/b' }).get(input)).toEqual(expected);
  expect(seen).toEqual([expected, expected]);
});

test('published 0.5.2 metadata v1 artifact preserves form and multipart body wire semantics', async () => {
  const observed: unknown[] = [];
  const contentTypes: string[] = [];
  const api = createStrictClient<LegacyPaths>({
    baseUrl: 'https://legacy.test',
    metadata: artifact,
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      const path = new URL(request.url).pathname;
      contentTypes.push(request.headers.get('content-type') ?? '');
      if (path === '/filters') {
        const wire = { path, body: await request.text() };
        observed.push(wire);
        return Response.json(wire);
      }
      if (path !== '/uploads') throw new TypeError(`Unexpected request path: ${path}`);
      const form = await request.formData();
      const file = form.get('attachment');
      if (!(file instanceof File)) throw new TypeError('Expected a File part.');
      const note = form.get('note');
      if (typeof note !== 'string') throw new TypeError('Expected a text field.');
      const wire = {
        path,
        note,
        filename: file.name,
        media: file.type,
        content: await file.text(),
      };
      observed.push(wire);
      return Response.json(wire);
    },
  });
  const formExpected = { path: '/filters', body: 'term=hello+world&labels=a,b' };
  expect(
    await api.filters.post({
      body: { term: 'hello world', labels: ['a', 'b'] },
      contentType: 'application/x-www-form-urlencoded',
    }),
  ).toEqual(formExpected);
  const multipartExpected = {
    path: '/uploads',
    note: 'hello',
    filename: 'photo.png',
    media: 'image/png',
    content: 'PNG',
  };
  expect(
    await api.uploads.post({
      body: {
        note: 'hello',
        attachment: new File(['PNG'], 'photo.png', { type: 'application/octet-stream' }),
      },
      contentType: 'multipart/form-data',
    }),
  ).toEqual(multipartExpected);
  expect(observed).toEqual([formExpected, multipartExpected]);
  expect(contentTypes[0]).toBe('application/x-www-form-urlencoded');
  expect(contentTypes[1]).toMatch(/^multipart\/form-data; boundary=/);
});

test('unknown artifact version fails at strict client construction', () => {
  const future = { ...artifact, version: 2 } as unknown as CompiledOpenAPIMetadata;
  let calls = 0;
  let thrown: unknown;
  try {
    createStrictClient<LegacyPaths>({
      baseUrl: 'https://legacy.test',
      metadata: future,
      transport: async () => {
        calls++;
        return new Response(null, { status: 204 });
      },
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(OpenAPIChainError);
  expect(thrown).toMatchObject({ code: 'METADATA_MISMATCH' });
  expect(calls).toBe(0);
});
