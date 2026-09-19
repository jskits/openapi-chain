import { describe, expect, test, vi } from 'vitest';
import {
  HttpError,
  createClient,
  type Transport,
  type RequestInput,
  type TransportRequest,
} from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';

type Paths = {
  '/': {
    get: { responses: { 200: { content: { 'application/json': { root: true } } } } };
  };
  '/colors/{id}': {
    parameters: { path: { id: number } };
    get: {
      parameters: {
        query?: {
          color?: { R: number; G: number };
          tags?: string[];
          pipes?: string[];
          filter?: { role: string; first: string };
          reserved?: string;
        };
        header?: { 'x-meta'?: { R: number; G: number } };
        cookie?: { prefs?: { role: string; first: string } };
      };
      responses: { 200: { content: { 'application/json': { ok: true } } } };
    };
  };
  '/json': {
    post: {
      requestBody: { content: { 'application/json': { name: string } } };
      responses: { 200: { content: { 'application/json': { saved: true } } } };
    };
  };
  '/form': {
    post: {
      requestBody: {
        content: {
          'application/x-www-form-urlencoded': {
            meta: { R: number; G: number };
            tags: string[];
          };
        };
      };
      responses: { 204: { content: never } };
    };
  };
  '/multipart': {
    post: {
      requestBody: {
        content: {
          'multipart/form-data': {
            meta: { x: number };
            file: Blob;
            title: string;
          };
        };
      };
      responses: { 204: { content: never } };
    };
  };
  '/payload': {
    get: {
      parameters: { query: { payload: { a: number } } };
      responses: { 204: { content: never } };
    };
  };
  '/xml-param/{doc}': {
    parameters: { path: { doc: { x: number } } };
    get: { responses: { 204: { content: never } } };
  };
  '/text': {
    post: {
      requestBody: { content: { 'text/plain': { x: number } } };
      responses: { 204: { content: never } };
    };
  };
  '/reports/{id}.json': {
    parameters: { path: { id: string } };
    get: {
      responses: { 200: { content: { 'application/json': { report: string } } } };
    };
  };
};

const document = {
  openapi: '3.1.0',
  components: {
    parameters: {
      Id: {
        name: 'id',
        in: 'path',
        required: true,
        style: 'matrix',
        schema: { type: 'integer' },
      },
    },
    requestBodies: {
      JsonBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/': { get: { responses: { 200: { description: 'ok' } } } },
    '/colors/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      get: {
        parameters: [
          {
            name: 'color',
            in: 'query',
            style: 'deepObject',
            explode: true,
            schema: { type: 'object' },
          },
          {
            name: 'tags',
            in: 'query',
            style: 'spaceDelimited',
            schema: { type: 'array' },
          },
          {
            name: 'pipes',
            in: 'query',
            style: 'pipeDelimited',
            schema: { type: 'array' },
          },
          {
            name: 'filter',
            in: 'query',
            style: 'form',
            explode: false,
            schema: { type: 'object' },
          },
          {
            name: 'reserved',
            in: 'query',
            allowReserved: true,
            schema: { type: 'string' },
          },
          {
            name: 'x-meta',
            in: 'header',
            style: 'simple',
            explode: true,
            schema: { type: 'object' },
          },
          {
            name: 'prefs',
            in: 'cookie',
            style: 'form',
            explode: true,
            schema: { type: 'object' },
          },
        ],
        responses: { 200: { description: 'ok' } },
      },
    },
    '/json': {
      post: {
        requestBody: { $ref: '#/components/requestBodies/JsonBody' },
        responses: { 200: { description: 'ok' } },
      },
    },
    '/form': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: {
                  meta: { type: 'object' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
              encoding: {
                meta: { style: 'deepObject', explode: true },
                tags: { style: 'pipeDelimited', explode: false },
              },
            },
          },
        },
        responses: { 204: { description: 'ok' } },
      },
    },
    '/multipart': {
      post: {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  meta: { type: 'object' },
                  file: {},
                  title: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 204: { description: 'ok' } },
      },
    },
    '/payload': {
      get: {
        parameters: [
          {
            name: 'payload',
            in: 'query',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        ],
        responses: { 204: { description: 'ok' } },
      },
    },
    '/xml-param/{doc}': {
      get: {
        parameters: [
          {
            name: 'doc',
            in: 'path',
            required: true,
            content: { 'application/xml': { schema: { type: 'object' } } },
          },
        ],
        responses: { 204: { description: 'ok' } },
      },
    },
    '/text': {
      post: {
        requestBody: {
          required: true,
          content: { 'text/plain': { schema: { type: 'object' } } },
        },
        responses: { 204: { description: 'ok' } },
      },
    },
    '/reports/{id}.json': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      get: { responses: { 200: { description: 'ok' } } },
    },
  },
} as const;

const metadata = compileOpenAPIMetadata(document);

describe('runtime OpenAPI serialization', () => {
  test('applies path/query/header/cookie styles and preserves base query/hash', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe(
        'https://api.test/v1/colors/;id=3?token=abc&color%5BR%5D=100&color%5BG%5D=200&tags=blue%20black&pipes=a%7Cb&filter=role,admin,first,Alex&reserved=a/b?c%26d%3De#frag',
      );
      const headers = new Headers(request.init.headers);
      expect(headers.get('x-meta')).toBe('R=100,G=200');
      expect(headers.get('cookie')).toBeNull();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'Application/JSON; Charset=UTF-8' },
      });
    });

    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test/v1?token=abc#frag',
      metadata,
      transport,
    });
    await expect(
      client.colors(3).get({
        query: {
          color: { R: 100, G: 200 },
          tags: ['blue', 'black'],
          pipes: ['a', 'b'],
          filter: { role: 'admin', first: 'Alex' },
          reserved: 'a/b?c&d=e',
        },
        header: { 'x-meta': { R: 100, G: 200 } },
      }),
    ).resolves.toEqual({ ok: true });
  });

  test('fails closed for compound cookie values using legacy style: form', async () => {
    const transport = vi.fn<Transport>(
      async (_request: TransportRequest) => new Response(null, { status: 204 }),
    );
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });

    await expect(
      client.colors(3).get({
        cookie: { prefs: { role: 'admin', first: 'Alex' } },
      }),
    ).rejects.toThrow('Cookie style form cannot faithfully represent compound');
    expect(transport).not.toHaveBeenCalled();
  });

  test('requires a concrete media type for wildcard request-body ranges', async () => {
    type P = {
      '/wild': {
        post: {
          requestBody: { content: { 'application/*': { x: number } } };
          responses: { 204: { content: never } };
        };
      };
    };
    const wildcardMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/wild': {
          post: {
            requestBody: {
              content: {
                'application/*': {
                  schema: {
                    type: 'object',
                    properties: { x: { type: 'number' } },
                  },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(new Headers(request.init.headers).get('content-type')).toBe('application/json');
      expect(request.init.body).toBe('{"x":1}');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: wildcardMetadata,
      transport,
    });

    await client.wild.post({ contentType: 'application/json', body: { x: 1 } });
    await expect(
      (client.wild.post as (input: unknown) => Promise<unknown>)({ body: { x: 1 } }),
    ).rejects.toThrow('contentType');
    await expect(
      (client.wild.post as (input: unknown) => Promise<unknown>)({
        contentType: 'text/plain',
        body: { x: 1 },
      }),
    ).rejects.toThrow('not declared');
    await expect(
      (client.wild.post as (input: unknown) => Promise<unknown>)({
        contentType: 'application/*',
        body: { x: 1 },
      }),
    ).rejects.toThrow('provide a concrete media type');
  });

  test('infers a single JSON media type only with compiled metadata', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(new Headers(request.init.headers).get('content-type')).toBe('application/json');
      expect(request.init.body).toBe('{"name":"A"}');
      return new Response(JSON.stringify({ saved: true }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await expect(client.json.post({ body: { name: 'A' } })).resolves.toEqual({
      saved: true,
    });
  });

  test('serializes urlencoded Encoding Object rules', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(new Headers(request.init.headers).get('content-type')).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(request.init.body).toBe('meta%5BR%5D=1&meta%5BG%5D=2&tags=a%7Cb');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await expect(
      client.form.post({ body: { meta: { R: 1, G: 2 }, tags: ['a', 'b'] } }),
    ).resolves.toBeUndefined();
  });

  test('uses content-based defaults for urlencoded complex objects', async () => {
    type DefaultFormPaths = {
      '/default-form': {
        post: {
          requestBody: {
            content: {
              'application/x-www-form-urlencoded': {
                id: string;
                address: { street: string };
                tags: string[];
              };
            };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const formMetadata = compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/default-form': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      address: {
                        type: 'object',
                        properties: { street: { type: 'string' } },
                      },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.init.body).toBe(
        'id=x&address=%7B%22street%22%3A%22123+Example+Dr.%22%7D&tags=a&tags=b',
      );
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<DefaultFormPaths>({
      baseUrl: 'https://api.test',
      metadata: formMetadata,
      transport,
    });
    await client['default-form'].post({
      body: {
        id: 'x',
        address: { street: '123 Example Dr.' },
        tags: ['a', 'b'],
      },
    });
  });

  test('keeps encoded binary strings in urlencoded forms and percent-encodes padding', async () => {
    type P = {
      '/binary-form': {
        post: {
          requestBody: {
            content: { 'application/x-www-form-urlencoded': { icon: string } };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const binaryMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/binary-form': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      icon: { type: 'string', contentEncoding: 'base64url' },
                    },
                  },
                  encoding: { icon: { contentType: 'image/png, image/jpeg' } },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.init.body).toBe('icon=abc%3D%3D');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: binaryMetadata,
      transport,
    });
    await client['binary-form'].post({ body: { icon: 'abc==' } });
  });

  test('uses RFC6570 percent encoding for style-based urlencoded fields', async () => {
    type P = {
      '/style-space': {
        post: {
          requestBody: {
            content: { 'application/x-www-form-urlencoded': { note: string } };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const styleMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/style-space': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: { type: 'object', properties: { note: { type: 'string' } } },
                  encoding: { note: { style: 'form' } },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.init.body).toBe('note=a%20b%2Bc');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: styleMetadata,
      transport,
    });
    await client['style-space'].post({ body: { note: 'a b+c' } });
  });

  test('serializes multipart JSON, binary and text parts', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(new Headers(request.init.headers).has('content-type')).toBe(false);
      expect(request.init.body).toBeInstanceOf(FormData);
      const form = request.init.body as FormData;
      const meta = form.get('meta');
      expect(meta).toBeInstanceOf(Blob);
      expect((meta as Blob).type).toBe('application/json');
      expect(await (meta as Blob).text()).toBe('{"x":1}');
      const file = form.get('file');
      expect(file).toBeInstanceOf(Blob);
      expect((file as Blob).type).toBe('application/octet-stream');
      expect(await (file as Blob).text()).toBe('abc');
      expect(form.get('title')).toBe('hello');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await client.multipart.post({
      body: {
        meta: { x: 1 },
        file: new Blob(['abc'], { type: 'application/octet-stream' }),
        title: 'hello',
      },
    });
  });

  test('body extension owns the whole strict request body and is never reused for multipart parts', async () => {
    type P = {
      '/multipart-extension': {
        post: {
          requestBody: {
            content: { 'multipart/form-data': { doc: { x: string } } };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const extensionMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/multipart-extension': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      doc: {
                        type: 'object',
                        properties: { x: { type: 'string' } },
                      },
                    },
                  },
                  encoding: { doc: { contentType: 'application/xml' } },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const extension = vi.fn<
      (input: { body: { doc: { x: string } }; contentType: 'multipart/form-data' }) => FormData
    >(
      ({
        body,
        contentType,
      }: {
        body: { doc: { x: string } };
        contentType: 'multipart/form-data';
      }) => {
        expect(contentType).toBe('multipart/form-data');
        expect(body.doc.x).toBe('hello');
        const form = new FormData();
        form.append('doc', `<doc>${body.doc.x}</doc>`);
        return form;
      },
    );
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(new Headers(request.init.headers).has('content-type')).toBe(false);
      expect(request.init.body).toBeInstanceOf(FormData);
      expect((request.init.body as FormData).get('doc')).toBe('<doc>hello</doc>');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: extensionMetadata,
      transport,
    });

    await client['multipart-extension'].post({
      body: { doc: { x: 'hello' } },
      extensions: { body: extension },
    });
    expect(extension).toHaveBeenCalledTimes(1);
  });

  test('supports Parameter Object content for JSON', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/payload?payload=%7B%22a%22%3A1%7D');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await client.payload.get({ query: { payload: { a: 1 } } });
  });

  test('uses a custom serializer for non-JSON Parameter content', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/xml-param/%3Cdoc%3E1%3C%2Fdoc%3E');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await client['xml-param']({ x: 1 }).get({
      extensions: {
        path: (value) => encodeURIComponent(`<doc>${value.x}</doc>`),
      },
    });
  });

  test('fails closed instead of JSON-stringifying structured text bodies', async () => {
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport: async () => new Response(null, { status: 204 }),
    });
    await expect(client.text.post({ body: { x: 1 } })).rejects.toThrow('body extension');
  });

  test('schema-free query serialization follows default form/explode behavior', async () => {
    type SchemaFreePaths = {
      '/search': {
        get: {
          parameters: {
            query?: {
              color?: { R: number; G: number };
              tags?: string[];
            };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/search?R=100&G=200&tags=a&tags=b');
      return new Response(null, { status: 204 });
    });
    const client = createClient<SchemaFreePaths>({
      baseUrl: 'https://api.test',
      transport,
    });
    await client.search.get({
      query: { color: { R: 100, G: 200 }, tags: ['a', 'b'] },
    });
  });

  test('tiny core preserves base URL query/hash while appending the OpenAPI path', async () => {
    type P = {
      '/users': { get: { responses: { 204: { content: never } } } };
    };
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/v1/users?token=x#frag');
      return new Response(null, { status: 204 });
    });
    const client = createClient<P>({
      baseUrl: 'https://api.test/v1?token=x#frag',
      transport,
    });
    await client.users.get();
  });

  test('schema-free structured bodies require an explicit contentType', async () => {
    type BodyPath = {
      '/x': {
        post: {
          requestBody: { content: { 'application/json': { x: number } } };
          responses: { 204: { content: never } };
        };
      };
    };
    const client = createClient<BodyPath>({
      baseUrl: 'https://api.test',
      transport: async () => new Response(null, { status: 204 }),
    });
    // Runtime guard protects untyped JS callers too.
    await expect(
      (client.x.post as (value: unknown) => Promise<unknown>)({ body: { x: 1 } }),
    ).rejects.toThrow('contentType');
  });

  test('applies operation-derived per-call extensions without widening the core client', async () => {
    type P = {
      '/items/{id}': {
        parameters: { path: { id: number } };
        post: {
          parameters: { query?: { mode?: 'fast' | 'safe' } };
          requestBody: { content: { 'application/json': { value: number } } };
          responses: { 200: { content: { 'application/json': { ok: true } } } };
        };
      };
    };
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/items/id=7?mode=FAST');
      expect(new Headers(request.init.headers).get('x-extension')).toBe('1');
      expect(request.init.body).toBe('{"wrapped":3}');
      return new Response('ignored', { status: 200, headers: { 'content-type': 'text/plain' } });
    });
    const client = createClient<P>({ baseUrl: 'https://api.test', transport });
    await expect(
      client.items(7).post({
        query: { mode: 'fast' },
        contentType: 'application/json',
        body: { value: 3 },
        extensions: {
          path: (id) => `id=${id}`,
          query: (query) => `mode=${query.mode?.toUpperCase()}`,
          body: ({ body }) => JSON.stringify({ wrapped: body.value }),
          request: (request) => {
            const headers = new Headers(request.init.headers);
            headers.set('x-extension', '1');
            return { ...request, init: { ...request.init, headers } };
          },
          response: async () => ({ status: 200, data: { ok: true } }),
        },
      }),
    ).resolves.toEqual({ ok: true });
  });

  test('response extensions preserve runtime status/data correlation', async () => {
    type P = {
      '/status': {
        get: {
          responses: {
            200: { content: { 'application/json': { success: string } } };
            400: { content: { 'application/json': { error: string } } };
          };
        };
      };
    };
    const client = createClient<P>({
      baseUrl: 'https://api.test',
      transport: async () => new Response('vendor', { status: 200 }),
    });
    await expect(
      client.status.get({
        extensions: {
          response: async () => ({
            status: 200,
            data: { success: 'parsed' },
          }),
        },
      }),
    ).resolves.toEqual({ success: 'parsed' });

    const unsafe = client.status.get as (input: unknown) => Promise<unknown>;
    await expect(
      unsafe({
        extensions: {
          response: async () => ({ status: 400, data: { error: 'wrong status' } }),
        },
      }),
    ).rejects.toThrow('Response status mismatch');
  });

  test('handles root and mixed-template $path routes', async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ root: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ report: 'ok' }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    const client = createStrictClient<Paths>({
      baseUrl: 'https://api.test',
      metadata,
      transport,
    });
    await expect(client.get()).resolves.toEqual({ root: true });
    expect(transport.mock.calls[0]![0].url).toBe('https://api.test/');
    await expect(
      client.$path('/reports/{id}.json', { id: 'monthly report' }).get(),
    ).resolves.toEqual({ report: 'ok' });
    expect(transport.mock.calls[1]![0].url).toBe('https://api.test/reports/monthly%20report.json');
  });

  test('applies operation-level path serialization after method selection', async () => {
    type P = {
      '/override/{id}': {
        parameters: { path: { id: string } };
        get: { responses: { 204: { content: never } } };
        post: { responses: { 204: { content: never } } };
      };
    };
    const overrideMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/override/{id}': {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              style: 'simple',
              schema: { type: 'string' },
            },
          ],
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                style: 'matrix',
                schema: { type: 'string' },
              },
            ],
            responses: { 204: { description: 'ok' } },
          },
          post: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                style: 'label',
                schema: { type: 'string' },
              },
            ],
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });
    const transport = vi.fn<Transport>(
      async (_request: TransportRequest) => new Response(null, { status: 204 }),
    );
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: overrideMetadata,
      transport,
    });

    await client.override('a b').get();
    await client.override('a b').post();
    expect(transport.mock.calls[0]![0].url).toBe('https://api.test/override/;id=a%20b');
    expect(transport.mock.calls[1]![0].url).toBe('https://api.test/override/.a%20b');
  });

  test('fails closed for multipart contentEncoding unless a custom serializer is supplied', async () => {
    type P = {
      '/encoded-multipart': {
        post: {
          requestBody: {
            content: { 'multipart/form-data': { payload: string } };
          };
          responses: { 204: { content: never } };
        };
      };
    };
    const encodedMetadata = compileOpenAPIMetadata({
      openapi: '3.1.2',
      paths: {
        '/encoded-multipart': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      payload: { type: 'string', contentEncoding: 'base64' },
                    },
                  },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    const strictClient = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: encodedMetadata,
      transport: async () => new Response(null, { status: 204 }),
    });
    await expect(
      strictClient['encoded-multipart'].post({ body: { payload: 'YWJj' } }),
    ).rejects.toThrow('Content-Transfer-Encoding');

    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.init.body).toBeInstanceOf(FormData);
      return new Response(null, { status: 204 });
    });
    const customClient = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: encodedMetadata,
      transport,
    });
    await customClient['encoded-multipart'].post({
      body: { payload: 'YWJj' },
      extensions: {
        body: ({ body }) => {
          const form = new FormData();
          form.append('payload', body.payload);
          return form;
        },
      },
    });
  });

  test('complete metadata validates required and declared runtime inputs', async () => {
    type StrictPaths = {
      '/strict': {
        post: {
          parameters: { query: { q: string } };
          requestBody: { content: { 'application/json': { name: string } } };
          responses: { 204: { content: never } };
        };
      };
    };

    const strictMetadata = compileOpenAPIMetadata({
      openapi: '3.1.0',
      paths: {
        '/strict': {
          post: {
            parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
              },
            },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    });

    const transport = vi.fn<Transport>(
      async (_request: TransportRequest) => new Response(null, { status: 204 }),
    );
    const client = createStrictClient<StrictPaths>({
      baseUrl: 'https://api.test',
      metadata: strictMetadata,
      transport,
    });
    const unsafePost = client.strict.post as unknown as (input: RequestInput) => Promise<unknown>;

    await expect(unsafePost({ query: { q: 'x' } })).rejects.toThrow(
      'Missing required OpenAPI request body',
    );
    await expect(
      unsafePost({ query: { q: 'x' }, contentType: 'application/json' }),
    ).rejects.toThrow('contentType cannot be provided without a request body');
    await expect(unsafePost({ body: { name: 'Ada' } })).rejects.toThrow(
      'Missing required OpenAPI query parameter',
    );
    await expect(
      unsafePost({ query: { q: 'x', extra: 'nope' }, body: { name: 'Ada' } }),
    ).rejects.toThrow('does not declare query parameter');

    await client.strict.post({ query: { q: 'x' }, body: { name: 'Ada' } });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('complete metadata fails fast on route mismatch', async () => {
    type Extra = { '/unknown': { get: { responses: { 204: { content: never } } } } };
    const client = createStrictClient<Extra>({
      baseUrl: 'https://api.test',
      metadata,
      transport: async () => new Response(null, { status: 204 }),
    });
    await expect(client.unknown.get()).rejects.toThrow('metadata does not match');
  });
});

describe('OpenAPI 3.2 runtime semantics', () => {
  type Paths32 = {
    '/search': {
      query: {
        parameters: { querystring: { search: { foo: string; bar: boolean } } };
        responses: { 204: { content: never } };
      };
    };
    '/jsonq': {
      get: {
        parameters: { querystring: { payload: { x: string } } };
        responses: { 204: { content: never } };
      };
    };
    '/cookies': {
      get: {
        parameters: { cookie: { prefs: { role: string; first: string } } };
        responses: { 204: { content: never } };
      };
    };
    '/reserved/{id}': {
      parameters: { path: { id: string } };
      get: { responses: { 204: { content: never } } };
    };
  };

  const metadata32 = compileOpenAPIMetadata({
    openapi: '3.2.1',
    paths: {
      '/search': {
        query: {
          parameters: [
            {
              name: 'search',
              in: 'querystring',
              required: true,
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: { foo: { type: 'string' }, bar: { type: 'boolean' } },
                  },
                },
              },
            },
          ],
          responses: { 204: { description: 'ok' } },
        },
      },
      '/jsonq': {
        get: {
          parameters: [
            {
              name: 'payload',
              in: 'querystring',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          ],
          responses: { 204: { description: 'ok' } },
        },
      },
      '/cookies': {
        get: {
          parameters: [
            {
              name: 'prefs',
              in: 'cookie',
              style: 'cookie',
              explode: true,
              schema: { type: 'object' },
            },
          ],
          responses: { 204: { description: 'ok' } },
        },
      },
      '/reserved/{id}': {
        get: {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              allowReserved: true,
              schema: { type: 'string' },
            },
          ],
          responses: { 204: { description: 'ok' } },
        },
      },
    },
  });

  test('supports QUERY and whole-query form-urlencoded querystring parameters', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.method).toBe('query');
      expect(request.init.method).toBe('QUERY');
      expect(request.url).toBe('https://api.test/search?foo=a+%2B+b&bar=true');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths32>({
      baseUrl: 'https://api.test',
      metadata: metadata32,
      transport,
    });
    await client.search.query({ querystring: { search: { foo: 'a + b', bar: true } } });
  });

  test('serializes JSON querystring as the entire encoded query component', async () => {
    const transport = vi.fn<Transport>(async (request: TransportRequest) => {
      expect(request.url).toBe('https://api.test/jsonq?%7B%22x%22%3A%22a%20b%22%7D');
      return new Response(null, { status: 204 });
    });
    const client = createStrictClient<Paths32>({
      baseUrl: 'https://api.test',
      metadata: metadata32,
      transport,
    });
    await client.jsonq.get({ querystring: { payload: { x: 'a b' } } });
  });

  test('supports OAS 3.2 cookie style and safe path allowReserved', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createStrictClient<Paths32>({
      baseUrl: 'https://api.test',
      metadata: metadata32,
      transport,
    });
    await client.cookies.get({ cookie: { prefs: { role: 'admin', first: 'Alex' } } });
    expect(new Headers(transport.mock.calls[0]![0].init.headers).get('cookie')).toBe(
      'role=admin; first=Alex',
    );
    await client.reserved('a:b/c').get();
    expect(transport.mock.calls[1]![0].url).toBe('https://api.test/reserved/a:b%2Fc');
  });
});

describe('transport, errors and parsing', () => {
  test('returns result unions with throwOnError false and throws by default', async () => {
    type ErrorPath = {
      '/x': {
        get: {
          responses: {
            200: { content: { 'application/json': { ok: true } } };
            404: { content: { 'application/json': { message: string } } };
          };
        };
      };
    };
    const response = () =>
      new Response(JSON.stringify({ message: 'missing' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });

    const resultClient = createClient<ErrorPath>({
      baseUrl: 'https://api.test',
      throwOnError: false,
      transport: async () => response(),
    });
    await expect(resultClient.x.get()).resolves.toMatchObject({
      ok: false,
      status: 404,
      data: { message: 'missing' },
    });

    const throwingClient = createClient<ErrorPath>({
      baseUrl: 'https://api.test',
      transport: async () => response(),
    });
    await expect(throwingClient.x.get()).rejects.toBeInstanceOf(HttpError);
  });

  test('runs middleware around transport', async () => {
    type P = { '/x': { get: { responses: { 204: { content: never } } } } };
    const seen: string[] = [];
    const client = createStrictClient<P>({
      baseUrl: 'https://api.test',
      metadata: compileOpenAPIMetadata({
        openapi: '3.1.0',
        paths: { '/x': { get: { responses: { 204: { description: 'ok' } } } } },
      }),
      transport: async (request) => {
        seen.push(`transport:${request.method}`);
        return new Response(null, { status: 204 });
      },
      middleware: [
        async (request, next) => {
          seen.push('before');
          const response = await next(request);
          seen.push('after');
          return response;
        },
      ],
    });
    await client.x.get();
    expect(seen).toEqual(['before', 'transport:get', 'after']);
  });
});
