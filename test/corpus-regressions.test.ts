import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { OpenAPIChainError } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/corpus-regressions/${name}.openapi.json`, import.meta.url),
      'utf8',
    ),
  );
}

type Search = {
  search: { get(input: { query: { filter: { term: string } } }): Promise<unknown> };
  $path(template: '/search'): Search['search'];
};

test('SoundCloud-shaped deepObject reaches the same wire and JSON response through fluent and exact paths', async () => {
  const seen: string[] = [];
  const api = createStrictClient({
    baseUrl: 'https://corpus.test',
    metadata: compileOpenAPIMetadata(fixture('soundcloud')),
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      const wire = new URL(request.url).pathname + new URL(request.url).search;
      seen.push(wire);
      return Response.json({ wire, accepted: true });
    },
  }) as unknown as Search;
  const input = { query: { filter: { term: 'a b' } } };
  const expected = { wire: '/search?filter%5Bterm%5D=a%20b', accepted: true };
  expect(await api.search.get(input)).toEqual(expected);
  expect(await api.$path('/search').get(input)).toEqual(expected);
  expect(seen).toEqual([expected.wire, expected.wire]);
});

type Rules = {
  rules(ruleId: string): { get(input: { query: { q: string } }): Promise<unknown> };
  $path(template: '/rules/{ruleId}', params: { ruleId: string }): ReturnType<Rules['rules']>;
};

test('OPA-shaped inapplicable path allowReserved preserves the endpoint and query wire', async () => {
  const seen: string[] = [];
  const api = createStrictClient({
    baseUrl: 'https://corpus.test',
    metadata: compileOpenAPIMetadata(fixture('opa')),
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      const wire = new URL(request.url).pathname + new URL(request.url).search;
      seen.push(wire);
      return Response.json({ wire });
    },
  }) as unknown as Rules;
  const expected = { wire: '/rules/a%2Fb?q=x/y' };
  expect(await api.rules('a/b').get({ query: { q: 'x/y' } })).toEqual(expected);
  expect(
    await api.$path('/rules/{ruleId}', { ruleId: 'a/b' }).get({ query: { q: 'x/y' } }),
  ).toEqual(expected);
  expect(seen).toEqual([expected.wire, expected.wire]);
});

type Imports = {
  imports: { post(input: { body: { name: string; torrentfile: File } }): Promise<unknown> };
  $path(template: '/imports'): Imports['imports'];
};

test('PeerTube-shaped oneOf encoding retains the declared multipart part type and parsed response', async () => {
  const observed: { name: string; fileName: string; media: string; bytes: string }[] = [];
  const api = createStrictClient({
    baseUrl: 'https://corpus.test',
    metadata: compileOpenAPIMetadata(fixture('peertube')),
    transport: async ({ url, init }) => {
      const request = new Request(url, init);
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      const form = await request.formData();
      const file = form.get('torrentfile');
      if (!(file instanceof File)) throw new TypeError('Expected a File part.');
      const name = form.get('name');
      if (typeof name !== 'string') throw new TypeError('Expected a text field.');
      const wire = {
        name,
        fileName: file.name,
        media: file.type,
        bytes: await file.text(),
      };
      observed.push(wire);
      return Response.json({ wire });
    },
  }) as unknown as Imports;
  const input = {
    body: {
      name: 'clip',
      torrentfile: new File(['d8:announce'], 'video.torrent', { type: 'application/octet-stream' }),
    },
  };
  const expected = {
    wire: {
      name: 'clip',
      fileName: 'video.torrent',
      media: 'application/x-bittorrent',
      bytes: 'd8:announce',
    },
  };
  expect(await api.imports.post(input)).toEqual(expected);
  expect(await api.$path('/imports').post(input)).toEqual(expected);
  expect(observed).toEqual([expected.wire, expected.wire]);
});

type Plugins = {
  Plugins(pluginId: string): (version: Record<string, unknown>) => { delete(): Promise<unknown> };
  $path(
    template: '/Plugins/{pluginId}/{version}',
    params: { pluginId: string; version: Record<string, unknown> },
  ): { delete(): Promise<unknown> };
};

test('Jellyfin-shaped empty object path values fail before either route form reaches transport', async () => {
  let calls = 0;
  const api = createStrictClient({
    baseUrl: 'https://corpus.test',
    metadata: compileOpenAPIMetadata(fixture('jellyfin')),
    transport: async () => {
      calls++;
      return new Response(null, { status: 204 });
    },
  }) as unknown as Plugins;
  const unsafe = (error: unknown) =>
    error instanceof OpenAPIChainError &&
    error.code === 'UNSAFE_PATH' &&
    /empty path segment/.test(error.message);
  await expect(api.Plugins('p1')({}).delete()).rejects.toSatisfy(unsafe);
  await expect(
    api.$path('/Plugins/{pluginId}/{version}', { pluginId: 'p1', version: {} }).delete(),
  ).rejects.toSatisfy(unsafe);
  expect(calls).toBe(0);
});
