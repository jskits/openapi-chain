import {
  joinUrl,
  appendRawQuery,
  serializeQuery,
  serializeQuerystring,
  appendParameterHeaders,
  appendCookieHeader,
  validateRuntimeInput,
  buildTemplatePath,
  buildChainPath,
  serializeBody,
} from './serialization.js';
import { createOperationResolver, type ProxyState } from './routes.js';
import { safePath } from './path.js';
import { httpMethods } from './constant.js';
import {
  HttpError,
  type API,
  type ClientOptions,
  type StrictClientOptions,
  type HttpMethod,
  type Middleware,
  type OpenAPIPaths,
  type RequestBodySerializer,
  type RequestInput,
  type Transport,
  type TransportRequest,
} from './type.js';

function isHttpMethod(value: string): value is HttpMethod {
  return httpMethods.includes(value as HttpMethod);
}

type Runtime = {
  options: ClientOptions;
  transport: Transport;
  resolveOperation: ReturnType<typeof createOperationResolver>;
};

type RuntimeOperationExtensions = {
  path?: (value: unknown, context: { index: number }) => string;
  query?: (value: Record<string, unknown>) => string | URLSearchParams;
  querystring?: (value: Record<string, unknown>) => string | URLSearchParams;
  header?: (value: Record<string, unknown>) => HeadersInit;
  cookie?: (value: Record<string, unknown>) => string;
  body?: (value: { body: unknown; contentType: string }) => BodyInit | undefined;
  response?: (
    response: Response,
  ) => { status: number; data: unknown } | Promise<{ status: number; data: unknown }>;
  request?: (
    request: TransportRequest,
    input: RequestInput,
  ) => TransportRequest | Promise<TransportRequest>;
};

async function defaultResponseParser(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return undefined;
  }
  if (response.headers.get('content-length') === '0') return undefined;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  if (
    contentType.startsWith('text/') ||
    contentType.includes('xml') ||
    contentType.includes('x-www-form-urlencoded')
  ) {
    const text = await response.text();
    return text || undefined;
  }
  const buffer = await response.arrayBuffer();
  return buffer.byteLength ? buffer : undefined;
}

function composeMiddleware(middleware: readonly Middleware[], transport: Transport): Transport {
  return middleware.reduceRight<Transport>(
    (next, current) => (request) => current(request, next),
    transport,
  );
}

function createDefaultTransport(fetchImpl: typeof globalThis.fetch): Transport {
  return ({ url, init }) => fetchImpl(url, init);
}

async function resolveHeaders(source: ClientOptions['headers']): Promise<Headers> {
  if (!source) return new Headers();
  const value = typeof source === 'function' ? await source() : source;
  return new Headers(value);
}

async function execute(
  runtime: Runtime,
  state: ProxyState,
  method: HttpMethod,
  input: RequestInput | undefined,
): Promise<unknown> {
  const extensions = input?.extensions as RuntimeOperationExtensions | undefined;
  const resolved = runtime.resolveOperation(state, method);
  const operation = resolved.metadata;
  const completeMetadata = runtime.options.metadata?.complete === true;
  validateRuntimeInput(input, operation, completeMetadata);
  const path =
    state.kind === 'template'
      ? buildTemplatePath(state.template, state.params, operation, undefined, extensions?.path)
      : buildChainPath(state, resolved.template, operation, undefined, extensions?.path);

  const headers = await resolveHeaders(runtime.options.headers);
  if (input?.header && extensions?.header) {
    new Headers(extensions.header(input.header)).forEach((value, key) => headers.set(key, value));
  } else {
    appendParameterHeaders(headers, input?.header, operation, undefined);
  }
  if (input?.init?.headers) {
    const extra = new Headers(input.init.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }
  if (input?.cookie && extensions?.cookie) {
    headers.set('cookie', extensions.cookie(input.cookie));
  } else {
    appendCookieHeader(headers, input?.cookie, operation, undefined);
  }

  const localBodySerializer: RequestBodySerializer | undefined = extensions?.body
    ? ({ body, contentType }) => extensions.body!({ body, contentType })
    : undefined;
  const body = serializeBody(
    input?.body,
    input?.contentType,
    headers,
    operation,
    completeMetadata,
    localBodySerializer,
  );

  let url = joinUrl(runtime.options.baseUrl, safePath(path));
  if (input?.query && input?.querystring) {
    throw new TypeError('OpenAPI query and querystring parameters cannot be used together.');
  }
  if (input?.querystring && Object.keys(input.querystring).length) {
    if (extensions?.querystring) {
      const custom = extensions.querystring(input.querystring);
      url = appendRawQuery(
        url,
        typeof custom === 'string' ? custom.replace(/^\?/, '') : custom.toString(),
      );
    } else {
      url = appendRawQuery(url, serializeQuerystring(input.querystring, operation, undefined));
    }
  } else if (input?.query && Object.keys(input.query).length) {
    const localQuery = extensions?.query;
    if (localQuery) {
      const custom = localQuery(input.query);
      const raw = typeof custom === 'string' ? custom.replace(/^\?/, '') : custom.toString();
      url = appendRawQuery(url, raw);
    } else {
      url = appendRawQuery(url, serializeQuery(input.query, operation, undefined));
    }
  }

  let request: TransportRequest = {
    url,
    method,
    init: {
      ...input?.init,
      method: method.toUpperCase(),
      headers,
      body: body ?? null,
    },
  };
  if (extensions?.request) request = await extensions.request(request, input ?? {});

  const response = await runtime.transport(request);
  let data: unknown;
  if (extensions?.response) {
    const parsed = await extensions.response(response);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.status !== response.status ||
      !('data' in parsed)
    ) {
      throw new TypeError('Response status mismatch');
    }
    data = parsed.data;
  } else {
    data = await defaultResponseParser(response);
  }
  const ok = response.status >= 200 && response.status < 300;

  if (runtime.options.throwOnError === false) {
    return { ok, status: response.status, data, response };
  }
  if (!ok) {
    throw new HttpError(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      response,
      data,
    );
  }
  return data;
}

function createProxy(runtime: Runtime, state: ProxyState): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') {
        if (prop === Symbol.toStringTag) return 'OpenAPIChain';
        return undefined;
      }
      if (prop === '$path' && state.kind === 'chain' && state.segments.length === 0) {
        return (template: string, params?: Record<string, unknown>) =>
          createProxy(runtime, { kind: 'template', template, params });
      }
      if (isHttpMethod(prop)) {
        return (input?: RequestInput) => execute(runtime, state, prop, input);
      }
      if (state.kind !== 'chain') {
        throw new TypeError('Cannot append chain segments after $path().');
      }
      return createProxy(runtime, {
        kind: 'chain',
        segments: [...state.segments, { kind: 'static', value: prop }],
      });
    },
    apply(_target, _thisArg, args) {
      if (state.kind !== 'chain') {
        throw new TypeError('$path() results are not callable path parameters.');
      }
      if (args.length !== 1) {
        throw new TypeError('A path parameter chain expects exactly one argument.');
      }
      return createProxy(runtime, {
        kind: 'chain',
        segments: [...state.segments, { kind: 'dynamic', value: args[0] }],
      });
    },
  });
}

function createRuntime(options: ClientOptions): Runtime {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!options.transport && typeof fetchImpl !== 'function') {
    throw new TypeError('No Fetch implementation is available. Provide `fetch` or `transport`.');
  }
  if (options.metadata && options.metadata.version !== 1) {
    throw new TypeError(
      `Unsupported OpenAPI metadata version: ${String(options.metadata.version)}`,
    );
  }
  const baseTransport = options.transport ?? createDefaultTransport(fetchImpl);
  return {
    options,
    resolveOperation: createOperationResolver(options.metadata),
    transport: composeMiddleware(options.middleware ?? [], baseTransport),
  };
}

export function createStrictClient<Paths extends OpenAPIPaths>(
  options: StrictClientOptions & { throwOnError: false },
): API<Paths, false, true>;
export function createStrictClient<Paths extends OpenAPIPaths>(
  options: StrictClientOptions & { throwOnError?: true | undefined },
): API<Paths, true, true>;
export function createStrictClient<Paths extends OpenAPIPaths>(
  options: StrictClientOptions,
): API<Paths, boolean, true>;
export function createStrictClient<Paths extends OpenAPIPaths>(
  options: StrictClientOptions,
): API<Paths, boolean, true> {
  return createProxy(createRuntime(options), {
    kind: 'chain',
    segments: [],
  }) as API<Paths, boolean, true>;
}
