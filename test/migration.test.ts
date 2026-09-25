/* oxlint-disable vitest/no-conditional-expect -- Table cases choose the expected outcome by fixed input/media type, never by a successful assertion. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createClient,
  HttpError,
  type RequestInput,
  type Transport,
  type TransportRequest,
  type CoreClientOptions,
  type CompiledOpenAPIMetadata,
  type OperationMetadata,
  type ParameterLocation,
} from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

type RuntimeNode = {
  get(input?: RequestInput): Promise<unknown>;
  post(input?: RequestInput): Promise<unknown>;
  $path(path: string, params?: Record<string, unknown>): RuntimeNode;
};
// Intentionally bypass schema typing to exercise runtime validation of JavaScript callers.
function client(
  strict: boolean,
  transport: Transport,
  operation: OperationMetadata = {},
  options: CoreClientOptions = { baseUrl: 'https://api.test' },
): RuntimeNode {
  if (!strict) return createClient({ ...options, transport }) as unknown as RuntimeNode;
  const location = (names: string[], kind: ParameterLocation) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        {
          name,
          in: kind,
          style: kind === 'header' || kind === 'path' ? ('simple' as const) : ('form' as const),
          explode: kind === 'query' || kind === 'cookie',
        },
      ]),
    );
  // This complete fixture declares every route/input used by the matrix. Forged
  // nested annotations below deliberately exercise serializer defensive checks.
  const declared: OperationMetadata = {
    requestBody: {
      mediaTypes: [
        'application/json',
        'text/plain',
        'application/octet-stream',
        'application/custom',
        'multipart/form-data',
        'application/x-www-form-urlencoded',
      ],
    },
    ...operation,
    parameters: {
      path: location(['id'], 'path'),
      query: location(['tags', 'obj', 'absent', 'q'], 'query'),
      header: location(['x-array', 'x-one', 'absent', 'x'], 'header'),
      cookie: location(['token', 'absent', 'x'], 'cookie'),
      ...operation.parameters,
    },
  };
  if (declared.parameters?.querystring) delete declared.parameters.query;
  return createStrictClient({
    ...options,
    transport,
    metadata: {
      version: 1,
      complete: true,
      operations: Object.fromEntries(
        ['/', '/{id}', '/plain'].map((path) => [path, { get: declared, post: declared }]),
      ),
    } as unknown as CompiledOpenAPIMetadata,
  }) as unknown as RuntimeNode;
}
const response = () =>
  new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe.each([false, true])('migrated request pipeline strict=%s', (strict) => {
  test('headers, cookies, query, raw templates and transport errors', async () => {
    const transport = vi.fn<Transport>(async () => response());
    const api = client(strict, transport);
    await api.$path('/{id}', { id: 'a b' }).get({
      query: { tags: ['x', 'y'], obj: { x: 'y' }, absent: undefined },
      header: { 'x-array': ['a', 'b'], 'x-one': '1', absent: undefined },
      cookie: { token: 'a b', absent: undefined },
      init: { headers: { 'x-one': '2' } },
    });
    const req = transport.mock.calls[0]![0];
    expect(req.url).toBe('https://api.test/a%20b?tags=x&tags=y&x=y');
    expect(new Headers(req.init.headers).get('x-array')).toBe('a,b');
    expect(new Headers(req.init.headers).get('x-one')).toBe('2');
    expect(new Headers(req.init.headers).get('cookie')).toBe('token=a%20b');
    await expect(api.$path('/{id}').get()).rejects.toThrow(/Missing/);
    transport.mockRejectedValueOnce(new Error('offline'));
    await expect(api.get()).rejects.toThrow('offline');
  });
  test('per-operation extensions own all request locations', async () => {
    const transport = vi.fn<Transport>(async () => response());
    const api = client(strict, transport);
    await api.$path('/{id}', { id: 'raw' }).post({
      query: { q: 1 },
      header: { x: 1 },
      cookie: { x: 1 },
      body: { a: 1 },
      contentType: 'application/custom',
      extensions: {
        path: () => 'custom',
        query: () => new URLSearchParams('q=custom'),
        header: () => ({ x: 'custom' }),
        cookie: () => 'x=custom',
        body: () => 'custom',
        request: (request: TransportRequest) => ({ ...request, url: request.url + '&last=1' }),
        response: async (r: Response) => ({ status: r.status, data: 'parsed' }),
      },
    });
    expect(transport.mock.calls[0]![0].url).toBe('https://api.test/custom?q=custom&last=1');
    expect(transport.mock.calls[0]![0].init.body).toBe('custom');
    await expect(
      api.get({ extensions: { response: () => ({ status: 201, data: null }) } }),
    ).rejects.toThrow(/status/i);
    const form = new FormData();
    form.set('x', 'y');
    await api.post({
      body: {},
      contentType: 'multipart/form-data',
      extensions: { body: () => form },
    });
    expect(new Headers(transport.mock.calls[2]![0].init.headers).has('content-type')).toBe(false);
  });
  test.each([
    ['application/json', { a: 1 }, '{"a":1}'],
    ['text/plain', 12, '12'],
    ['text/plain', false, 'false'],
    ['application/octet-stream', 'raw', 'raw'],
  ])('serializes %s bodies', async (contentType, body, expected) => {
    const transport = vi.fn<Transport>(async () => response());
    await client(strict, transport).post({ contentType, body });
    expect(transport.mock.calls[0]![0].init.body).toBe(expected);
  });
  test('native bodies and invalid structured media', async () => {
    const transport = vi.fn<Transport>(async () => response());
    const api = client(strict, transport);
    for (const body of [new Blob(['x']), new ArrayBuffer(2), new URLSearchParams('a=b')]) {
      await api.post({ contentType: 'application/octet-stream', body });
      expect(transport.mock.lastCall![0].init.body).toBe(body);
    }
    await expect(api.post({ body: {} })).rejects.toThrow(/contentType/);
    await expect(api.post({ body: {}, contentType: 'application/custom' })).rejects.toThrow(
      /extension/,
    );
    await expect(api.post({ body: {}, contentType: 'text/plain' })).rejects.toThrow(/extension/);
  });
  test.each([204, 205, 304])('empty HTTP %s responses', async (status) => {
    const api = client(
      strict,
      async () => new Response(null, { status }),
      {},
      { baseUrl: 'https://api.test', throwOnError: false },
    );
    expect(await api.get()).toMatchObject({ status, data: undefined, ok: status < 300 });
  });
  test.each(['', 'hello'])('text response %j', async (text) => {
    expect(await client(strict, async () => new Response(text)).get()).toBe(text || undefined);
  });
  test('HTTP errors and zero-length responses', async () => {
    const api = client(strict, async () => new Response('bad', { status: 400 }));
    await expect(api.get()).rejects.toBeInstanceOf(HttpError);
    expect(
      await client(
        strict,
        async () => new Response(null, { headers: { 'content-length': '0' } }),
      ).get(),
    ).toBeUndefined();
  });
  test('proxy invariants and default fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response());
    vi.stubGlobal('fetch', fetchMock);
    const options = {
      baseUrl: 'https://api.test',
      metadata: compileOpenAPIMetadata({ openapi: '3.1.0', paths: { '/': { get: {} } } }),
    };
    const api = (strict
      ? createStrictClient(options)
      : createClient({ baseUrl: options.baseUrl })) as unknown as RuntimeNode;
    await api.get();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(Reflect.get(api, 'then')).toBeUndefined();
    expect(Reflect.get(api, Symbol.iterator)).toBeUndefined();
    expect(() => Reflect.apply(api as unknown as CallableFunction, null, [])).toThrow(/argument/);
    const template = api.$path('/');
    expect(() => Reflect.get(template, 'extra')).toThrow(TypeError);
    expect(() => Reflect.apply(template as unknown as CallableFunction, null, ['x'])).toThrow(
      TypeError,
    );
    vi.stubGlobal('fetch', undefined);
    expect(() =>
      strict ? createStrictClient(options) : createClient({ baseUrl: options.baseUrl }),
    ).toThrow(/fetch|Fetch/);
  });
});

describe('strict serialization matrix', () => {
  test.each([
    ['simple', false, ['a', 'b'], 'a,b'],
    ['label', false, ['a', 'b'], '.a,b'],
    ['label', true, ['a', 'b'], '.a.b'],
    ['matrix', false, ['a', 'b'], ';id=a,b'],
    ['matrix', true, ['a', 'b'], ';id=a;id=b'],
    ['simple', false, { a: 1, b: 2 }, 'a,1,b,2'],
    ['simple', true, { a: 1, b: 2 }, 'a=1,b=2'],
    ['label', false, { a: 1 }, '.a,1'],
    ['label', true, { a: 1 }, '.a=1'],
    ['matrix', false, { a: 1 }, ';id=a,1'],
    ['matrix', true, { a: 1 }, ';a=1'],
    ['label', false, null, '.null'],
  ] as const)('path %s explode=%s value=%j', async (style, explode, value, expected) => {
    const transport = vi.fn<Transport>(async () => response());
    const api = client(true, transport, {
      parameters: { path: { id: { name: 'id', in: 'path', style, explode } } },
    });
    await api.$path('/{id}', { id: value }).get();
    expect(transport.mock.lastCall![0].url).toBe(`https://api.test/${expected}`);
  });
  test.each([
    ['form', false, ['a', 'b'], 'id=a,b'],
    ['form', true, ['a', 'b'], 'id=a&id=b'],
    ['form', false, { a: 1 }, 'id=a,1'],
    ['form', true, { a: 1 }, 'a=1'],
    ['spaceDelimited', false, { a: 1 }, 'id=a%201'],
    ['pipeDelimited', false, { a: 1 }, 'id=a%7C1'],
    ['deepObject', true, { a: 1 }, 'id%5Ba%5D=1'],
    ['form', true, null, 'id=null'],
  ] as const)('query %s explode=%s value=%j', async (style, explode, value, expected) => {
    const transport = vi.fn<Transport>(async () => response());
    await client(true, transport, {
      parameters: { query: { id: { name: 'id', in: 'query', style, explode } } },
    })
      .$path('/{id}', { id: 'x' })
      .get({ query: { id: value } });
    expect(transport.mock.lastCall![0].url).toBe(`https://api.test/x?${expected}`);
  });
  test.each([false, true])('header objects explode=%s', async (explode) => {
    const transport = vi.fn<Transport>(async () => response());
    await client(true, transport, {
      parameters: { header: { id: { name: 'id', in: 'header', style: 'simple', explode } } },
    })
      .$path('/{id}', { id: 'x' })
      .get({ header: { ID: { a: 1 } } });
    expect(new Headers(transport.mock.lastCall![0].init.headers).get('id')).toBe(
      explode ? 'a=1' : 'a,1',
    );
  });
  test.each([
    ['array', ['a', 'b'], 'id=a; id=b'],
    ['scalar', 'a', 'id=a'],
  ] as const)('cookie %s', async (_name, value, expected) => {
    const transport = vi.fn<Transport>(async () => response());
    await client(true, transport, {
      parameters: { cookie: { id: { name: 'id', in: 'cookie', style: 'cookie', explode: true } } },
    })
      .$path('/{id}', { id: 'x' })
      .get({ cookie: { id: value } });
    expect(new Headers(transport.mock.lastCall![0].init.headers).get('cookie')).toBe(expected);
  });
  test.each(['path', 'query', 'header', 'cookie'] as const)(
    'parameter content at %s',
    async (location) => {
      for (const contentType of ['application/json', 'text/plain', 'application/custom']) {
        const transport = vi.fn<Transport>(async () => response());
        const api = client(true, transport, {
          parameters: {
            [location]: {
              id: { name: 'id', in: location, style: 'simple', explode: false, contentType },
            },
          },
        });
        const call = api
          .$path('/{id}', { id: 'x' })
          .get(location === 'path' ? {} : { [location]: { id: 'x' } });
        if (contentType === 'application/custom') await expect(call).rejects.toThrow(/extension/);
        else {
          await call;
          expect(transport).toHaveBeenCalledOnce();
        }
      }
    },
  );
});

describe.each(['application/x-www-form-urlencoded', 'multipart/form-data'])(
  'form encoding %s',
  (contentType) => {
    test.each([
      [
        'form',
        true,
        ['a', 'b'],
        [
          ['id', 'a'],
          ['id', 'b'],
        ],
      ],
      ['form', false, ['a', 'b'], [['id', 'a,b']]],
      ['form', true, { a: 1 }, [['a', '1']]],
      ['form', false, { a: 1 }, [['id', 'a,1']]],
      ['form', true, 'a b', [['id', 'a b']]],
      ['deepObject', true, { a: 1 }, [['id[a]', '1']]],
      ['spaceDelimited', false, ['a', 'b'], [['id', 'a b']]],
      ['spaceDelimited', false, { a: 1 }, [['id', 'a 1']]],
      ['pipeDelimited', false, ['a', 'b'], [['id', 'a|b']]],
      ['pipeDelimited', false, { a: 1 }, [['id', 'a|1']]],
    ] as const)('%s explode=%s value=%j', async (style, explode, value, expected) => {
      const transport = vi.fn<Transport>(async () => response());
      const operation: OperationMetadata = {
        requestBody: {
          mediaTypes: [contentType],
          media: { [contentType]: { encoding: { id: { style, explode, styleBased: true } } } },
        },
      };
      await client(true, transport, operation)
        .$path('/{id}', { id: 'x' })
        .post({ contentType, body: { id: value, absent: undefined } });
      const body = transport.mock.lastCall![0].init.body;
      const pairs =
        body instanceof FormData
          ? [...body.entries()]
          : [...new URLSearchParams(body as string).entries()];
      expect(pairs).toEqual(expected);
    });
    test.each([
      ['deepObject', false, {}],
      ['deepObject', true, 'bad'],
      ['spaceDelimited', true, []],
      ['spaceDelimited', false, 'bad'],
      ['pipeDelimited', true, []],
      ['pipeDelimited', false, 'bad'],
      ['simple', true, 'bad'],
      ['form', true, { a: {} }],
    ] as const)('rejects invalid %s explode=%s value=%j', async (style, explode, value) => {
      const transport = vi.fn<Transport>(async () => response());
      const operation: OperationMetadata = {
        requestBody: {
          mediaTypes: [contentType],
          media: { [contentType]: { encoding: { id: { style, explode, styleBased: true } } } },
        },
      };
      await expect(
        client(true, transport, operation)
          .$path('/{id}', { id: 'x' })
          .post({ contentType, body: { id: value } }),
      ).rejects.toThrow(TypeError);
      expect(transport).not.toHaveBeenCalled();
    });
    test('rejects invalid top-level forms', async () => {
      await expect(
        client(true, async () => response()).post({ contentType, body: [] }),
      ).rejects.toThrow(/must be an object/);
    });
    test('default field content serialization', async () => {
      const transport = vi.fn<Transport>(async () => response());
      await client(true, transport).post({
        contentType,
        body: { text: 'a b', obj: { a: 1 }, array: ['a', 'b'], empty: [], missing: undefined },
      });
      const body = transport.mock.lastCall![0].init.body;
      if (body instanceof FormData) {
        expect(body.get('text')).toBe('a b');
        expect(await (body.get('obj') as Blob).text()).toBe('{"a":1}');
        expect(body.getAll('array')).toEqual(['a', 'b']);
      } else expect(new URLSearchParams(body as string).get('obj')).toBe('{"a":1}');
    });
  },
);

test('strict native multipart content and text variants', async () => {
  const transport = vi.fn<Transport>(async () => response());
  const api = client(true, transport);
  for (const body of [new Blob(['hello'], { type: 'text/plain' }), 42n]) {
    await api.post({ contentType: 'text/plain', body });
    expect(transport.mock.lastCall![0].init.body).toBe(typeof body === 'bigint' ? '42' : body);
  }
  await api.post({
    contentType: 'multipart/form-data',
    body: {
      blob: new Blob(['a'], { type: 'text/plain' }),
      binary: new Uint8Array([65]),
      buffer: new Uint8Array([66]).buffer,
    },
  });
  const form = transport.mock.lastCall![0].init.body as FormData;
  expect(await (form.get('binary') as Blob).text()).toBe('A');
  expect(await (form.get('buffer') as Blob).text()).toBe('B');
  const explicit: OperationMetadata = {
    requestBody: {
      mediaTypes: ['multipart/form-data'],
      media: {
        'multipart/form-data': {
          encoding: { blob: { contentType: 'text/html' }, text: { contentType: 'text/html' } },
        },
      },
    },
  };
  await client(true, transport, explicit)
    .$path('/{id}', { id: 'x' })
    .post({ contentType: 'multipart/form-data', body: { blob: new Blob(['a']), text: 'hello' } });
  const typed = transport.mock.lastCall![0].init.body as FormData;
  expect((typed.get('blob') as Blob).type).toBe('text/html');
  expect(await (typed.get('text') as Blob).text()).toBe('hello');
  await api.post({ body: new FormData() });
  await api.post({ body: new Blob(['a'], { type: 'text/plain' }) });
  await api.post({
    contentType: 'application/x-www-form-urlencoded',
    body: new URLSearchParams('x=y'),
  });
  expect(transport.mock.lastCall![0].init.body).toBe('x=y');
  await expect(
    api.post({ contentType: 'application/octet-stream', body: new FormData() }),
  ).rejects.toThrow(/FormData/);
  await expect(api.post({ contentType: 'application/*', body: 'x' })).rejects.toThrow(
    /media range/,
  );
});

test('forged nested metadata is rejected at the wire boundary', async () => {
  for (const location of ['path', 'query', 'cookie'] as const) {
    for (const value of ['x', ['x'], { x: 1 }]) {
      const transport = vi.fn<Transport>(async () => response());
      const api = client(true, transport, {
        parameters: {
          [location]: { id: { name: 'id', in: location, style: 'deepObject', explode: false } },
        },
      });
      const call = api
        .$path('/{id}', { id: location === 'path' ? value : 'x' })
        .get(location === 'path' ? {} : { [location]: { id: value } });
      if (location === 'query' && typeof value === 'object' && !Array.isArray(value)) await call;
      else await expect(call).rejects.toThrow(TypeError);
    }
  }
  for (const style of ['spaceDelimited', 'pipeDelimited', 'label'] as const) {
    const api = client(true, async () => response(), {
      parameters: { query: { id: { name: 'id', in: 'query', style, explode: true } } },
    });
    await expect(api.$path('/{id}', { id: 'x' }).get({ query: { id: 'bad' } })).rejects.toThrow(
      TypeError,
    );
  }
  for (const style of ['spaceDelimited', 'pipeDelimited'] as const) {
    const api = client(true, async () => response(), {
      parameters: { query: { id: { name: 'id', in: 'query', style, explode: false } } },
    });
    await expect(api.$path('/{id}', { id: 'x' }).get({ query: { id: 'bad' } })).rejects.toThrow(
      TypeError,
    );
  }
  const api = client(true, async () => response(), {
    parameters: { cookie: { id: { name: 'id', in: 'cookie', style: 'cookie', explode: false } } },
  });
  await expect(api.$path('/{id}', { id: 'x' }).get({ cookie: { id: ['a', 'b'] } })).rejects.toThrow(
    /explode/,
  );
  await expect(api.$path('/plain', { extra: 1 }).get()).rejects.toThrow(/does not accept/);
  await expect(api.$path('/{id}', { id: 'x', extra: 1 }).get()).rejects.toThrow(/unexpected/);
});

test('strict querystring extensions, suffix joining and binary responses', async () => {
  const transport = vi.fn<Transport>(async () => response());
  const api = client(
    true,
    transport,
    {
      parameters: {
        querystring: {
          all: {
            name: 'all',
            in: 'querystring',
            style: 'form',
            explode: true,
            contentType: 'application/custom',
          },
        },
      },
    },
    { baseUrl: 'https://api.test/?base=1#hash' },
  );
  for (const querystring of ['?q=x', new URLSearchParams('q=x')]) {
    await api.get({ querystring: { all: 'x' }, extensions: { querystring: () => querystring } });
    expect(transport.mock.lastCall![0].url).toBe('https://api.test/?base=1&q=x#hash');
  }
  await expect(api.get({ query: {}, querystring: {} })).rejects.toThrow(/cannot be used together/);
  await expect(api.get({ querystring: { all: 'x' } })).rejects.toThrow(TypeError);
  for (const body of [new Uint8Array([65]), new Uint8Array()]) {
    const result = await client(true, async () => new Response(body)).get();
    if (body.length) expect(new Uint8Array(result as ArrayBuffer)).toEqual(body);
    else expect(result).toBeUndefined();
  }
  expect(
    await client(
      true,
      async () => new Response('', { headers: { 'content-type': 'application/json' } }),
    ).get(),
  ).toBeUndefined();
});
