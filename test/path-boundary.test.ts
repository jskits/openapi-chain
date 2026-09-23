import { expect, test } from 'vitest';
import { createClient, type Transport } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { safeUrl } from '../packages/core/src/path.js';

type Paths = {
  '/files/{id}': {
    parameters: { path: { id: string } };
    post: {
      parameters: { query?: { q?: string }; header?: { h?: string }; cookie?: { c?: string } };
      requestBody: { content: { 'application/json': object } };
      responses: { 204: { content: never } };
    };
  };
};
const metadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: {
    '/files/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        parameters: [
          ['q', 'query'],
          ['h', 'header'],
          ['c', 'cookie'],
        ].map(([name, location]) => ({ name, in: location, schema: { type: 'string' } })),
        requestBody: { content: { 'application/json': {} } },
      },
    },
  },
});

test.each([false, true])(
  'unsafe path extensions reject before other callbacks, strict=%s',
  async (strict) => {
    const events: string[] = [];
    const transport: Transport = async () => {
      events.push('transport');
      return new Response(null, { status: 204 });
    };
    const options = { baseUrl: 'https://example.test/root?base=1#anchor', transport };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    const attacks = [
      '..?x=1',
      '%2e%2e?x=1',
      '.#fragment',
      '%2e#fragment',
      '..\\..\\admin',
      '%2e%2e\\admin',
      'a/b',
      'a?b',
      'a#b',
    ];
    // Fetch strips embedded tab/newline characters before resolving dot segments.
    for (const control of ['\t', '\r', '\n', '\0', '\x7f'])
      attacks.push(`.${control}.`, `a${control}b`);
    for (const path of attacks) {
      events.length = 0;
      await expect(
        api.files('id').post({
          query: { q: 'x' },
          header: { h: 'x' },
          cookie: { c: 'x' },
          body: {},
          contentType: 'application/json',
          extensions: {
            path: () => {
              events.push('path');
              return path;
            },
            header: () => {
              events.push('header');
              return {};
            },
            cookie: () => {
              events.push('cookie');
              return '';
            },
            query: () => {
              events.push('query');
              return '';
            },
            body: () => {
              events.push('body');
              return '{}';
            },
          },
        }),
      ).rejects.toThrow(/path|Path/);
      expect(events).toEqual(['path']);
    }
  },
);

test.each([false, true])(
  'ordinary parameters containing delimiters stay encoded within the base, strict=%s',
  async (strict) => {
    const paths: string[] = [];
    const options = {
      baseUrl: 'https://example.test/root',
      transport: async ({ url }: { url: string }) => {
        paths.push(new Request(url).url);
        return new Response(null, { status: 204 });
      },
    };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    for (const id of ['..\\..\\admin', '..?q=1', '.#fragment', '\t..'])
      await api.files(id).post({ body: {}, contentType: 'application/json' });
    expect(paths.every((path) => path.startsWith('https://example.test/root/files/'))).toBe(true);
    expect(paths).toHaveLength(4);
  },
);

test('final URL validation checks origin and path-segment boundaries', () => {
  expect(() => safeUrl('https://example.test/root', 'https://other.test/root/x')).toThrow(
    /escapes/,
  );
  expect(() => safeUrl('https://example.test/root', 'https://example.test/rooted/x')).toThrow(
    /escapes/,
  );
  expect(() => safeUrl('https://example.test/root', 'https://example.test/root/../x')).toThrow(
    /escapes/,
  );
  expect(safeUrl('/api', '/api/x?q=1')).toBe('/api/x?q=1');
  expect(safeUrl('https://example.test/root/', 'https://example.test/root//x')).toBe(
    'https://example.test/root//x',
  );
});
