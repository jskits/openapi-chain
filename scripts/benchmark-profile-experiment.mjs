import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';
import { compileOpenAPIMetadata } from '../dist/metadata.js';

// An explicitly incomplete build-time experiment, never a published package entry.
// Remove all three roots of structured form serialization, including OAS 3.2 querystring.
const formCalls = [
  'return serializeMultipartBody(body, operation, contentType);',
  'return serializeUrlEncodedBody(body, operation, contentType);',
  'return serializeUrlEncodedBody(value, operation, parameter.contentType, parameter.media);',
];
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-profiles-'));
try {
  for (const profile of ['full', 'without-forms']) {
    const outDir = join(directory, profile);
    await build({
      config: false,
      entry: { entry: fileURLToPath(new URL('../src/strict.ts', import.meta.url)) },
      outDir,
      format: ['esm'],
      target: 'es2022',
      platform: 'browser',
      deps: { alwaysBundle: /.*/ },
      minify: true,
      dts: false,
      sourcemap: false,
      publint: false,
      attw: false,
      logLevel: 'silent',
      plugins:
        profile === 'full'
          ? []
          : [
              {
                name: 'experimental-remove-form-roots',
                transform(code, id) {
                  if (!id.endsWith('/src/serialization.ts')) return;
                  for (const call of formCalls) {
                    assert.ok(code.includes(call), `Experiment needs updating: ${call}`);
                    code = code.replace(
                      call,
                      'throw new TypeError("Experimental build requires forms serializer.");',
                    );
                  }
                  return { code, map: null };
                },
              },
            ],
    });
    const output = join(outDir, 'entry.js');
    const bytes = readFileSync(output);
    const { createStrictClient } = await import(pathToFileURL(output).href);
    const calls = [];
    const api = createStrictClient({
      baseUrl: 'https://api.test',
      metadata: compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: {
          '/search': {
            get: {
              parameters: [
                {
                  name: 'filter',
                  in: 'query',
                  style: 'deepObject',
                  explode: true,
                  schema: { type: 'object' },
                },
              ],
            },
          },
          '/json': {
            post: {
              requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
          '/form': {
            post: {
              requestBody: {
                content: {
                  'application/x-www-form-urlencoded': {
                    schema: { type: 'object', properties: { a: { type: 'string' } } },
                  },
                },
              },
            },
          },
          '/multipart': {
            post: {
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: { type: 'object', properties: { a: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      }),
      transport: async (request) => {
        calls.push(request);
        return new Response(null, { status: 204 });
      },
    });
    await api.search.get({ query: { filter: { name: 'book' } } });
    await api.json.post({ body: { a: 'x' } });
    assert.equal(calls[0].url, 'https://api.test/search?filter%5Bname%5D=book');
    assert.equal(calls[1].init.body, '{"a":"x"}');
    if (profile === 'full') {
      await api.form.post({ body: { a: 'x' } });
      await api.multipart.post({ body: { a: 'x' } });
      assert.equal(String(calls[2].init.body), 'a=x');
      assert.equal(calls[3].init.body.get('a'), 'x');
    } else {
      await assert.rejects(api.form.post({ body: { a: 'x' } }), /requires forms/);
      await assert.rejects(api.multipart.post({ body: { a: 'x' } }), /requires forms/);
      assert.equal(calls.length, 2);
    }
    console.log(
      JSON.stringify({
        profile,
        minifiedBytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        registrationFrameworkIncluded: false,
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
