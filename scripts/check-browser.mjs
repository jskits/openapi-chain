import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright';

let origin;
let pendingStream;
async function handle(request, response) {
  const url = new URL(request.url, origin);
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-credentials', 'true');
  response.setHeader('access-control-allow-headers', 'content-type,x-probe');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === '/query/index.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(readFileSync(new URL('../packages/query/dist/index.js', import.meta.url)));
    return;
  }
  if (url.pathname.startsWith('/dist/')) {
    response.setHeader('content-type', 'text/javascript');
    response.end(
      readFileSync(new URL(`../packages/core/dist/${basename(url.pathname)}`, import.meta.url)),
    );
    return;
  }
  if (url.pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>openapi-chain browser qualification</title>');
    return;
  }
  if (url.pathname === '/redirect') {
    response.writeHead(302, { location: '/' });
    response.end();
    return;
  }
  if (url.pathname === '/misleading-text') {
    response.setHeader('content-type', 'text/plain; note="application/json"');
    response.end('hello');
    return;
  }
  if (url.pathname === '/session') {
    response.setHeader('set-cookie', 'session=browser; HttpOnly; SameSite=Lax; Path=/');
  }
  if (url.pathname === '/stream') {
    response.setHeader('content-type', 'application/octet-stream');
    response.write('A');
    pendingStream = response;
    response.on('close', () => {
      if (pendingStream === response) pendingStream = undefined;
    });
    return;
  }
  if (url.pathname === '/release') {
    pendingStream?.end('B');
    response.end('{}');
    return;
  }
  if (url.pathname === '/slow') {
    const timer = setTimeout(() => response.end('{}'), 1000);
    response.on('close', () => clearTimeout(timer));
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = new Uint8Array(Buffer.concat(chunks));
  const contentType = request.headers['content-type'] ?? '';
  let field;
  if (url.pathname === '/upload') {
    const form = await new Request(url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    }).formData();
    field = form.get('name');
  }
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify({
      field,
      bytes: [...body],
      contentType,
      cookie: request.headers.cookie ?? '',
      query: url.searchParams.get('q'),
      probe: request.headers['x-probe'] ?? '',
    }),
  );
}
function makeServer() {
  return createServer((request, response) => {
    void handle(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
const servers = [makeServer(), makeServer()];
let browser;
try {
  origin = await listen(servers[0]);
  const crossOrigin = await listen(servers[1]);
  browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage();
  await page.goto(origin);
  const realmResults = await page.evaluate(async (origin) => {
    const { createClient } = await import(`${origin}/dist/index.js`);
    const { createStrictClient } = await import(`${origin}/dist/strict.js`);
    const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const realm = frame.contentWindow;
    const form = new realm.FormData();
    form.append('field', 'value');
    const cases = [
      ['application/octet-stream', new realm.Blob(['blob'])],
      ['multipart/form-data', form],
      ['application/x-www-form-urlencoded', new realm.URLSearchParams({ a: 'b' })],
      ['application/octet-stream', new realm.Uint8Array([65, 66]).buffer],
    ];
    const results = [];
    const formErrors = [];
    for (const strict of [false, true]) {
      for (const [contentType, body] of cases) {
        const metadata = compileOpenAPIMetadata({
          openapi: '3.1.0',
          paths: { '/realm': { post: { requestBody: { content: { [contentType]: {} } } } } },
        });
        const options = {
          baseUrl: origin,
          transport: async ({ init }) => {
            const wire = new Request(`${origin}/realm`, { method: 'POST', ...init });
            const actual =
              contentType === 'multipart/form-data'
                ? (await wire.formData()).get('field')
                : await wire.text();
            results.push(actual);
            return new Response(null, { status: 204 });
          },
        };
        const api = strict ? createStrictClient({ ...options, metadata }) : createClient(options);
        await api.realm.post({ contentType, body });
      }
      const metadata = compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: { '/realm': { post: { requestBody: { content: { '*/*': {} } } } } },
      });
      const options = {
        baseUrl: origin,
        transport: async () => {
          throw new Error('Invalid FormData reached transport.');
        },
      };
      const api = strict ? createStrictClient({ ...options, metadata }) : createClient(options);
      for (const contentType of [
        'text/plain',
        'application/json',
        'multipart/form-data; profile=A',
      ]) {
        for (const input of [{ body: form }, { body: {}, extensions: { body: () => form } }]) {
          try {
            await api.realm.post({ ...input, contentType });
          } catch (error) {
            formErrors.push(error.code);
          }
        }
      }
    }
    frame.remove();
    return { results, formErrors };
  }, origin);
  assert.deepEqual(realmResults, {
    results: ['blob', 'value', 'a=b', 'AB', 'blob', 'value', 'a=b', 'AB'],
    formErrors: Array(12).fill('SERIALIZATION'),
  });
  const adapterResult = await page.evaluate(async (origin) => {
    const { createQuery } = await import(`${origin}/query/index.js`);
    const { createStrictClient } = await import(`${origin}/dist/strict.js`);
    const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
    const urls = [];
    const api = createStrictClient({
      baseUrl: origin,
      metadata: compileOpenAPIMetadata({
        openapi: '3.1.1',
        paths: {
          '/search/query/': {
            get: { parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] },
          },
        },
      }),
      fetch: async (url, init) => {
        urls.push(String(url));
        return fetch(url, init);
      },
    });
    const operation = createQuery({
      key: ['browser', 'GET', '/search/query/'],
      fetcher: (input, { signal }) =>
        api.search.query.get({ query: { q: input.q }, init: { signal } }),
    });
    const input = { q: 'original' };
    const options = operation.queryOptions(input);
    input.q = 'mutated';
    const result = await options.queryFn({ signal: new AbortController().signal });
    const swr = operation.swr({ q: 'swr' });
    const second = await swr.fetcher(swr.key);
    return { query: result.query, swr: second.query, urls };
  }, origin);
  assert.deepEqual(adapterResult, {
    query: 'original',
    swr: 'swr',
    urls: [`${origin}/search/query/?q=original`, `${origin}/search/query/?q=swr`],
  });
  const coreBoundary = await page.evaluate(async (origin) => {
    const { createClient } = await import(`${origin}/dist/index.js`);
    let sent = 0;
    const errors = [];
    for (const extra of [
      { metadata: {} },
      { middleware: [] },
      { headers: () => ({ authorization: 'token' }) },
    ]) {
      try {
        createClient({
          baseUrl: origin,
          ...extra,
          transport: async () => {
            sent++;
            return new Response(null, { status: 204 });
          },
        });
        errors.push('accepted');
      } catch (error) {
        errors.push(error.message);
      }
    }
    return { errors, sent };
  }, origin);
  assert.deepEqual(coreBoundary, {
    errors: Array(3).fill('Use @openapi-chain/core/strict.'),
    sent: 0,
  });
  const result = await page.evaluate(
    async ({ origin, crossOrigin }) => {
      const { createClient } = await import(`${origin}/dist/index.js`);
      const { createStrictClient } = await import(`${origin}/dist/strict.js`);
      const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
      const metadata = compileOpenAPIMetadata({
        openapi: '3.2.1',
        paths: {
          '/upload': { post: { requestBody: { content: { 'multipart/form-data': {} } } } },
          '/echo': {
            get: {
              parameters: [
                { name: 'q', in: 'query', allowReserved: true, schema: { type: 'string' } },
              ],
            },
          },
          '/session': { get: {} },
          '/slow': { get: {} },
          '/stream': { get: {} },
        },
      });
      const results = [];
      for (const create of [createClient, createStrictClient]) {
        const api = create({
          baseUrl: crossOrigin,
          ...(create === createStrictClient ? { metadata } : {}),
          headers: { 'content-type': 'application/json' },
        });
        await api.session.get({ init: { credentials: 'include' } });
        const body = new FormData();
        body.set('name', '中文😀');
        const uploaded = await api.upload.post({
          contentType: 'multipart/form-data',
          body,
          init: { credentials: 'include', headers: { 'x-probe': 'preflight' } },
        });
        const omitted = await api.echo.get({ query: { q: '😀' }, init: { credentials: 'omit' } });
        const emptyQuery = await api.echo.get({
          query: {},
          extensions: { query: () => '?q=from-extension' },
        });
        const controller = new AbortController();
        const abort = api.slow.get({ init: { signal: controller.signal } }).then(
          () => 'not aborted',
          (error) => error.name,
        );
        setTimeout(() => controller.abort(), 20);
        const stream = await api.stream.get({
          extensions: {
            response: (response) => ({ status: response.status, data: response.body }),
          },
        });
        const reader = stream.getReader();
        const first = await reader.read();
        await fetch(`${crossOrigin}/release`);
        const second = await reader.read();
        await reader.cancel();
        results.push({
          field: uploaded.field,
          multipart: uploaded.contentType.startsWith('multipart/form-data; boundary='),
          cookie: uploaded.cookie,
          probe: uploaded.probe,
          omittedCookie: omitted.cookie,
          unicode: omitted.query,
          emptyQuery: emptyQuery.query,
          abort: await abort,
          chunks: [new TextDecoder().decode(first.value), new TextDecoder().decode(second.value)],
        });
      }
      return results;
    },
    { origin, crossOrigin },
  );
  for (const value of result)
    assert.deepEqual(value, {
      field: '中文😀',
      multipart: true,
      cookie: 'session=browser',
      probe: 'preflight',
      omittedCookie: '',
      unicode: '😀',
      emptyQuery: 'from-extension',
      abort: 'AbortError',
      chunks: ['A', 'B'],
    });

  const parts = await page.evaluate(
    async ({ origin, crossOrigin }) => {
      const { createClient } = await import(`${origin}/dist/index.js`);
      const { createStrictClient } = await import(`${origin}/dist/strict.js`);
      const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
      const metadata = compileOpenAPIMetadata({
        openapi: '3.1.1',
        paths: {
          '/upload': {
            post: {
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: { properties: { files: {}, text: { type: 'string' } } },
                    encoding: {
                      files: { contentType: 'image/*' },
                      text: { contentType: 'text/plain; charset=utf-8' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const api = createStrictClient({ baseUrl: crossOrigin, metadata });
      const received = await api.upload.post({
        body: {
          files: [
            new File(['A'], 'one.png', { type: 'image/png' }),
            new File(['B'], 'two.jpg', { type: 'image/jpeg' }),
          ],
          text: 'café😀',
        },
      });
      const bytes = new Uint8Array(received.bytes);
      const wire = new TextDecoder().decode(bytes);
      const parsed = await new Response(bytes, {
        headers: { 'content-type': received.contentType },
      }).formData();
      const binary = await createClient({ baseUrl: crossOrigin }).binary.post({
        contentType: 'application/octet-stream',
        body: new Uint8Array([99, 65, 66, 98]).subarray(1, 3),
      });
      return {
        files: parsed.getAll('files').map((file) => [file.name, file.type]),
        text: await parsed.get('text').text(),
        explicitCharset: wire.includes('Content-Type: text/plain; charset=utf-8'),
        hasWildcard: wire.includes('Content-Type: image/*'),
        binary: binary.bytes,
      };
    },
    { origin, crossOrigin },
  );
  assert.deepEqual(parts, {
    files: [
      ['one.png', 'image/png'],
      ['two.jpg', 'image/jpeg'],
    ],
    text: 'café😀',
    explicitCharset: true,
    hasWildcard: false,
    binary: [65, 66],
  });

  const mediaResults = await page.evaluate(
    async ({ origin, crossOrigin }) => {
      const { createClient } = await import(`${origin}/dist/index.js`);
      const { createStrictClient } = await import(`${origin}/dist/strict.js`);
      const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
      const metadata = compileOpenAPIMetadata({
        openapi: '3.1.1',
        paths: {
          '/misleading-text': { get: {} },
          '/text': { post: { requestBody: { content: { 'text/plain': {} } } } },
        },
      });
      const results = [];
      for (const create of [createClient, createStrictClient]) {
        const api = create({
          baseUrl: crossOrigin,
          ...(create === createStrictClient ? { metadata } : {}),
        });
        const text = await api.$path('/misleading-text').get();
        const encoded = await api.text.post({
          body: 'café',
          contentType: 'text/plain; charset=utf-8',
        });
        const rejection = await api.text
          .post({ body: 'café', contentType: 'text/plain; charset=iso-8859-1' })
          .then(
            () => false,
            (error) => error instanceof TypeError,
          );
        results.push({ text, bytes: encoded.bytes, rejection });
      }
      return results;
    },
    { origin, crossOrigin },
  );
  for (const result of mediaResults)
    assert.deepEqual(result, { text: 'hello', bytes: [99, 97, 102, 195, 169], rejection: true });
  const unreadableResults = await page.evaluate(
    async ({ origin, crossOrigin }) => {
      const { createClient } = await import(`${origin}/dist/index.js`);
      const { createStrictClient } = await import(`${origin}/dist/strict.js`);
      const { compileOpenAPIMetadata } = await import(`${origin}/dist/metadata.js`);
      const metadata = compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: { '/probe': { get: {} } },
      });
      const results = [];
      for (const make of [createClient, createStrictClient]) {
        for (const throwOnError of [false, true]) {
          for (const redirect of [false, true]) {
            let type;
            const api = make({
              baseUrl: origin,
              ...(make === createStrictClient ? { metadata } : {}),
              throwOnError,
              transport: async () => {
                const response = await fetch(
                  redirect ? `${origin}/redirect` : `${crossOrigin}/opaque`,
                  redirect ? { redirect: 'manual' } : { mode: 'no-cors' },
                );
                type = response.type;
                return response;
              },
            });
            try {
              await api.probe.get();
              results.push({ type, rejected: false });
            } catch (error) {
              results.push({
                type,
                rejected: error instanceof TypeError && error.message === 'Response status 0',
              });
            }
          }
        }
      }
      return results;
    },
    { origin, crossOrigin },
  );
  assert.equal(unreadableResults.length, 8);
  for (const [index, result] of unreadableResults.entries()) {
    assert.deepEqual(result, { type: index % 2 ? 'opaqueredirect' : 'opaque', rejected: true });
  }
  console.log(
    'Chromium: query adapter snapshots/fetchers with strict method-name and trailing-slash routing, strict-only core option rejection, core/strict ESM, multipart, Unicode, credentialed CORS, cookie omission, abort, streaming, multipart part fidelity, binary slices, response media, text charsets and unreadable status-zero responses passed.',
  );
} finally {
  await browser?.close();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) => {
          server.closeAllConnections();
          if (!server.listening) {
            resolve();
            return;
          }
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
}
