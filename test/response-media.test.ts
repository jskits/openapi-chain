import { expect, test } from 'vitest';
import { createClient } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type Paths = { '/x': { get: { responses: { 200: { content: { '*/*': unknown } } } } } };
const metadata = compileOpenAPIMetadata({ openapi: '3.1.1', paths: { '/x': { get: {} } } });
for (const strict of [false, true]) {
  const parse = (contentType: string, body: BodyInit) => {
    const options = {
      baseUrl: 'https://example.test',
      transport: async () => new Response(body, { headers: { 'content-type': contentType } }),
    };
    const api = strict
      ? createStrictClient<Paths>({ ...options, metadata })
      : createClient<Paths>(options);
    return api.x.get();
  };
  test(`response media parameters cannot select JSON or XML parsers, strict=${strict}`, async () => {
    expect(await parse('text/plain; note="application/json"', 'hello')).toBe('hello');
    for (const type of [
      'application/octet-stream; note="xml"',
      'application/json-seq',
      'application/notjson',
    ]) {
      const value = await parse(type, new Uint8Array([255, 0, 65]));
      expect(strict ? [...new Uint8Array(value as ArrayBuffer)] : typeof value).toEqual(
        strict ? [255, 0, 65] : 'string',
      );
    }
  });
  test(`exact JSON types and suffixes retain parsing, strict=${strict}`, async () => {
    for (const type of [
      'Application/JSON; charset=UTF-8',
      'application/problem+json; note="xml"',
    ]) {
      expect(await parse(type, '{"ok":true}')).toEqual({ ok: true });
      await expect(parse(type, 'bad')).rejects.toBeInstanceOf(SyntaxError);
    }
    expect(await parse('application/problem+xml', '<ok/>')).toBe('<ok/>');
  });
}
