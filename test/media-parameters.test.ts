import { expect, test, vi } from 'vitest';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { RequestInput, Transport } from '../packages/core/src/index.js';
import {
  mediaRangeMatches,
  parseMediaRange,
  selectMediaDeclaration,
} from '../packages/core/src/media-range.js';

test('media matching preserves case-sensitive profile values and quoted semicolons', () => {
  expect(
    mediaRangeMatches(
      'application/json; PROFILE="A;B"',
      'Application/JSON; profile="A;B"; charset=UTF-8',
    ),
  ).toBe(true);
  expect(mediaRangeMatches('application/json; profile=A', 'application/json; profile=a')).toBe(
    false,
  );
  expect(
    mediaRangeMatches('application/json; charset=utf-8', 'application/json; CHARSET="UTF-8"'),
  ).toBe(true);
  expect(parseMediaRange('application/json; profile="a\\\"b"').parameters.get('profile')).toBe(
    'a"b',
  );
});
test('selects parameter-specific media and rejects equally specific ambiguity', () => {
  const declarations = ['*/*', 'application/*', 'application/json', 'application/json; profile=a'];
  expect(selectMediaDeclaration(declarations, 'application/json; profile=a')).toBe(declarations[3]);
  expect(selectMediaDeclaration(declarations, 'application/json; profile=b')).toBe(declarations[2]);
  expect(() =>
    selectMediaDeclaration(
      ['application/json; profile=a', 'application/json; version=1'],
      'application/json; profile=a; version=1',
    ),
  ).toThrow(/Ambiguous/);
});
test.each([
  'invalid',
  'application/json;',
  'application/json; profile=a; PROFILE=b',
  'application/json; profile="unterminated',
])('rejects invalid declarations: %s', (value) => {
  expect(() => parseMediaRange(value)).toThrow(TypeError);
});
test('profile-specific serialization metadata cannot silently match another profile', async () => {
  const media = 'application/x-www-form-urlencoded';
  const metadata = compileOpenAPIMetadata({
    openapi: '3.2.0',
    paths: {
      '/x': {
        post: {
          requestBody: {
            content: {
              [`${media}; profile=json`]: { schema: { properties: { x: { type: 'object' } } } },
              [`${media}; profile=flat`]: {
                schema: { properties: { x: { type: 'object' } } },
                encoding: { x: { style: 'form' } },
              },
            },
          },
        },
      },
    },
  });
  const transport = vi.fn<Transport>(async () => new Response(null, { status: 204 }));
  const api = createStrictClient({
    baseUrl: 'https://api.test',
    metadata,
    transport,
  }) as unknown as { x: { post(input: RequestInput): Promise<unknown> } };
  await expect(api.x.post({ body: { x: { a: 'b' } }, contentType: media })).rejects.toThrow(
    /not declared/,
  );
  await api.x.post({ body: { x: { a: 'b' } }, contentType: `${media}; profile=flat` });
  await api.x.post({ body: { x: { a: 'b' } }, contentType: `${media}; profile=json` });
  expect(transport.mock.calls.map(([request]) => request.init.body)).toEqual([
    'a=b',
    'x=%7B%22a%22%3A%22b%22%7D',
  ]);
});
