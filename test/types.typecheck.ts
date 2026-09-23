import {
  createClient,
  type API,
  type ApiResult,
  type CompiledOpenAPIMetadata,
  type OperationExtensionsFor,
  type SuccessData,
} from '../src/index.js';
import { createStrictClient } from '../src/strict.js';

type Paths = {
  '/': {
    get: {
      responses: {
        200: { content: { 'application/json': { root: true } } };
      };
    };
  };
  '/users/{id}/posts': {
    parameters: { path: { id: number } };
    get: {
      responses: {
        200: { content: { 'application/json': { posts: true } } };
      };
    };
  };
  '/users/{slug}/settings': {
    parameters: { path: { slug: string } };
    get: {
      responses: {
        200: { content: { 'application/json': { settings: true } } };
      };
    };
  };
  '/mixed/{id}': {
    parameters: { path: { id: string | number } };
    get: {
      parameters: { path: { id: number } };
      responses: {
        200: { content: { 'application/json': { method: 'get' } } };
      };
    };
    post: {
      parameters: { path: { id: string } };
      responses: {
        201: { content: { 'application/json': { method: 'post' } } };
      };
    };
  };
  '/optional-body': {
    post: {
      requestBody?: {
        content: {
          'application/json': { image: string };
          'text/plain': string;
        };
      };
      responses: { 204: { content: never } };
    };
  };
  '/wildcard-body': {
    post: {
      requestBody: { content: { 'application/*': { x: number } } };
      responses: { 204: { content: never } };
    };
  };
  '/single-body': {
    post: {
      requestBody: { content: { 'application/json': { x: number } } };
      responses: {
        200: { content: { 'application/json': { ok: true } } };
      };
    };
  };
  '/response-extension': {
    get: {
      responses: {
        200: { content: { 'application/json': { success: string } } };
        400: { content: { 'application/json': { error: string } } };
      };
    };
  };
  '/default-only': {
    get: {
      responses: {
        default: { content: { 'application/json': { fallback: true } } };
      };
    };
  };
  '/status-precedence': {
    get: {
      responses: {
        200: { content: { 'application/json': { exact: true } } };
        '2XX': { content: { 'application/json': { wildcard: true } } };
        default: { content: { 'application/json': { fallback: true } } };
      };
    };
  };
  '/search32': {
    query: {
      parameters: { querystring?: { payload?: { q: string } } };
      responses: { 204: { content: never } };
    };
  };
  '/no-content': {
    get: { responses: { 204: { content: never } } };
  };
};

declare const schemaFree: API<Paths>;
void schemaFree.get();
void schemaFree.users(1).posts.get();
void schemaFree.users('alice').settings.get();
// @ts-expect-error dynamic branches must not contaminate one another
void schemaFree.users(1).settings.get();
// @ts-expect-error dynamic branches must not contaminate one another
void schemaFree.users('alice').posts.get();

void schemaFree.mixed(1).get();
// @ts-expect-error operation-level path parameter override filters POST
void schemaFree.mixed(1).post();
void schemaFree.mixed('abc').post();
// @ts-expect-error operation-level path parameter override filters GET
void schemaFree.mixed('abc').get();

declare const unionId: string | number;
const unionNode = schemaFree.mixed(unionId);
// @ts-expect-error a union path value is not safe for GET until narrowed
void unionNode.get();
// @ts-expect-error a union path value is not safe for POST until narrowed
void unionNode.post();

void schemaFree['optional-body'].post();
void schemaFree['optional-body'].post({
  contentType: 'application/json',
  body: { image: 'x' },
});
void schemaFree['optional-body'].post({ contentType: 'text/plain', body: 'raw' });
// @ts-expect-error optional bodies still preserve contentType/body correlation
void schemaFree['optional-body'].post({ contentType: 'text/plain', body: { image: 'x' } });
// @ts-expect-error contentType without a body is not a meaningful body variant
void schemaFree['optional-body'].post({ contentType: 'application/json' });

// Media ranges cannot be inferred as a concrete Content-Type even with compiled metadata.
void schemaFree['wildcard-body'].post({
  contentType: 'application/json',
  body: { x: 1 },
});
// @ts-expect-error application/* does not accept text/plain
void schemaFree['wildcard-body'].post({ contentType: 'text/plain', body: { x: 1 } });

// Without compiled metadata, runtime cannot infer a single media type from a type.
// @ts-expect-error schema-free single-media body requires contentType
void schemaFree['single-body'].post({ body: { x: 1 } });
void schemaFree['single-body'].post({
  contentType: 'application/json',
  body: { x: 1 },
});

void schemaFree['single-body'].post({
  contentType: 'application/json',
  body: { x: 1 },
  extensions: {
    body: ({ body, contentType }) => {
      const x: number = body.x;
      const media: 'application/json' = contentType;
      void x;
      void media;
      return JSON.stringify(body);
    },
    response: async () => ({ status: 200, data: { ok: true } }),
    request: (request, input) => {
      const x: number = input.body.x;
      void x;
      return request;
    },
  },
});

void schemaFree.mixed(1).get({
  extensions: {
    path: (value) => {
      const id: number = value;
      return String(id);
    },
  },
});

void schemaFree.mixed('abc').post({
  extensions: {
    path: (value) => {
      const id: string = value;
      return id;
    },
  },
});

void schemaFree['single-body'].post({
  contentType: 'application/json',
  body: { x: 1 },
  extensions: {
    // @ts-expect-error response extension must return status-correlated declared data
    response: async () => ({ status: 200, data: { wrong: true } }),
  },
});

void schemaFree['response-extension'].get({
  extensions: {
    response: async () => ({ status: 200, data: { success: 'ok' } }),
  },
});
void schemaFree['response-extension'].get({
  extensions: {
    // @ts-expect-error status 200 cannot be paired with the 400 response body
    response: async () => ({ status: 200, data: { error: 'wrong' } }),
  },
});

void schemaFree.search32.query();
// @ts-expect-error querystring requires compiled OpenAPI 3.2 runtime metadata
void schemaFree.search32.query({ querystring: { payload: { q: 'x' } } });

const reusableSingleBodyExtension = {
  body: ({ body, contentType }) => {
    const x: number = body.x;
    const media: 'application/json' = contentType;
    void x;
    void media;
    return JSON.stringify(body);
  },
  response: async () => ({ status: 200, data: { ok: true } }),
} satisfies OperationExtensionsFor<Paths, '/single-body', 'post'>;

void schemaFree['single-body'].post({
  contentType: 'application/json',
  body: { x: 1 },
  extensions: reusableSingleBodyExtension,
});

declare const compiledMetadata: CompiledOpenAPIMetadata;
const compiled = createStrictClient<Paths>({
  baseUrl: 'https://example.test',
  metadata: compiledMetadata,
  transport: async () => new Response(),
});

createStrictClient<Paths>({
  baseUrl: 'https://example.test',
  metadata: compiledMetadata,
  transport: async () => new Response(),
  // @ts-expect-error untyped global response parsers are replaced by operation-local typed extensions
  responseParser: async () => 'wrong-shape',
});
void compiled['single-body'].post({ body: { x: 1 } });
void compiled['single-body'].post({
  body: { x: 1 },
  extensions: {
    body: ({ body, contentType }) => {
      const x: number = body.x;
      const media: 'application/json' = contentType;
      void x;
      void media;
      return JSON.stringify(body);
    },
    response: async () => ({ status: 200, data: { ok: true } }),
  },
});

void compiled['wildcard-body'].post({ contentType: 'application/json', body: { x: 1 } });
// @ts-expect-error a wildcard media range is not a concrete media type to infer
void compiled['wildcard-body'].post({ body: { x: 1 } });

void compiled.search32.query({ querystring: { payload: { q: 'x' } } });

const noBodyVariable = { body: { x: 1 }, contentType: 'application/json' };
// @ts-expect-error operations without requestBody reject body fields even through variables
void schemaFree['no-content'].get(noBodyVariable);
const undeclaredQueryVariable = { query: { extra: 'x' } };
// @ts-expect-error absent parameter locations are explicitly forbidden, not widened by structural typing
void schemaFree['no-content'].get(undeclaredQueryVariable);

void schemaFree.$path('/no-content');
// @ts-expect-error a path with no templates accepts no params argument
void schemaFree.$path('/no-content', {});
void schemaFree.$path('/mixed/{id}', { id: 1 }).get();
// @ts-expect-error $path rejects extra template arguments
void schemaFree.$path('/mixed/{id}', { id: 1, extra: 2 });
// @ts-expect-error $path filters methods by operation-level path params too
void schemaFree.$path('/mixed/{id}', { id: 1 }).post();

type DefaultSuccess = SuccessData<Paths['/default-only']['get']>;
const defaultSuccess: DefaultSuccess = { fallback: true };
void defaultSuccess;

type StatusResult = ApiResult<Paths['/status-precedence']['get']>;
const exact: StatusResult = {
  ok: true,
  status: 200,
  data: { exact: true },
  response: new Response(),
};
const wildcard: StatusResult = {
  ok: true,
  status: 201,
  data: { wildcard: true },
  response: new Response(),
};
const fallbackError: StatusResult = {
  ok: false,
  status: 404,
  data: { fallback: true },
  response: new Response(),
};
const invalidPrecedence: StatusResult = {
  ok: true,
  status: 200,
  // @ts-expect-error exact status 200 takes precedence over 2XX
  data: { wildcard: true },
  response: new Response(),
};
void exact;
void wildcard;
void fallbackError;
void invalidPrecedence;

type EmptySuccess = SuccessData<Paths['/no-content']['get']>;
const empty: EmptySuccess = undefined;
// Referencing this value in a typed assignment verifies no-content responses.
const emptyCheck: undefined = empty;
export type EmptyCheck = typeof emptyCheck;

const dynamicThrowMode: boolean = Math.random() > 0.5;
const dynamicClient = createClient<Paths>({
  baseUrl: 'https://example.test',
  throwOnError: dynamicThrowMode,
  transport: async () => new Response(),
});
void dynamicClient;

// Paths with significant outer slashes must use the lossless template escape.
type SlashPaths = {
  '/items/': { get: { responses: { 204: { content: never } } } };
  '//other': { get: { responses: { 204: { content: never } } } };
};
const slashCore = createClient<SlashPaths>({ baseUrl: 'https://example.test' });
const slashStrict = createStrictClient<SlashPaths>({
  baseUrl: 'https://example.test',
  metadata: {} as CompiledOpenAPIMetadata,
});
// @ts-expect-error trailing slash is not representable by a chain
slashCore.items.get();
void slashStrict.items.get();
// @ts-expect-error repeated leading slash is not representable by a chain
slashCore.other.get();
void slashCore.$path('/items/').get();
void slashStrict.$path('//other').get();

// Status-zero transport responses reject before entering the HTTP result union.
type ZeroResult = Extract<ApiResult<Paths['/default-only']['get']>, { status: 0 }>;
// @ts-expect-error unreadable responses are never HTTP result values
const zeroResult: ZeroResult = {
  ok: false,
  status: 0,
  data: undefined,
  response: Response.error(),
};
void zeroResult;
// @ts-expect-error even a default response covers only HTTP statuses
const zeroStatus: ApiResult<Paths['/default-only']['get']>['status'] = 0;
void zeroStatus;
