/* oxlint-disable typescript/no-base-to-string -- Core scalar coercion intentionally follows String(); structured serialization uses typed extensions. */
import { safePath } from './path.js';
import { httpMethods } from './constant.js';
import {
  HttpError,
  type API,
  type CoreClientOptions,
  type HttpMethod,
  type OpenAPIPaths,
  type RequestInput,
  type Transport,
  type TransportRequest,
} from './type.js';

type PathSegment = { dynamic: boolean; value: unknown };
type State =
  | { segments: PathSegment[] }
  | { template: string; params?: Record<string, unknown> | undefined };
type RuntimeExtensions = {
  path?: (v: unknown, c: { index: number }) => string;
  query?: (v: Record<string, unknown>) => string | URLSearchParams;
  header?: (v: Record<string, unknown>) => HeadersInit;
  cookie?: (v: Record<string, unknown>) => string;
  body?: (v: { body: unknown; contentType: string }) => BodyInit | undefined;
  response?: (
    r: Response,
  ) => { status: number; data: unknown } | Promise<{ status: number; data: unknown }>;
  request?: (r: TransportRequest, i: RequestInput) => TransportRequest | Promise<TransportRequest>;
};
type Runtime = { options: CoreClientOptions; transport: Transport };

const isMethod = (v: string): v is HttpMethod => httpMethods.includes(v as HttpMethod);
const encodeScalar = (v: unknown) => encodeURIComponent(String(v));
const normalizeQuery = (v: string | URLSearchParams) =>
  (typeof v === 'string' ? v : v.toString()).replace(/^\?/, '');
const isNativeBody = (v: unknown): v is BodyInit =>
  typeof v === 'string' ||
  (typeof Blob !== 'undefined' && v instanceof Blob) ||
  (typeof FormData !== 'undefined' && v instanceof FormData) ||
  (typeof URLSearchParams !== 'undefined' && v instanceof URLSearchParams) ||
  (typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer);

function serializeQuery(input: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(input)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
    else if (typeof value === 'object')
      Object.entries(value as Record<string, unknown>).forEach(
        ([key, entry]) => entry != null && query.append(key, String(entry)),
      );
    else query.append(name, String(value));
  }
  return query.toString();
}

function appendQuery(url: string, query: string) {
  if (!query) return url;
  const hashIndex = url.indexOf('#');
  const hash = hashIndex < 0 ? '' : url.slice(hashIndex);
  const base = hashIndex < 0 ? url : url.slice(0, hashIndex);
  return `${base}${base.includes('?') ? '&' : '?'}${query}${hash}`;
}

function renderPath(state: State, serialize?: RuntimeExtensions['path']) {
  let dynamicIndex = 0;
  const encode = (value: unknown) =>
    serialize ? serialize(value, { index: dynamicIndex++ }) : encodeScalar(value);
  if ('template' in state)
    return state.template.replace(/\{([^{}]+)\}/g, (_m, name: string) => {
      if (!state.params || !Object.hasOwn(state.params, name))
        throw new TypeError(`Missing path: ${name}`);
      return encode(state.params[name]);
    });
  return state.segments.length
    ? `/${state.segments.map((segment) => (segment.dynamic ? encode(segment.value) : segment.value)).join('/')}`
    : '/';
}

function requestBody(
  body: unknown,
  contentType: string | undefined,
  headers: Headers,
  serialize?: RuntimeExtensions['body'],
) {
  if (body === undefined) return undefined;
  if (!contentType) throw new TypeError('Schema-free body needs contentType.');
  if (serialize) {
    const serialized = serialize({ body: body, contentType: contentType });
    if (typeof FormData !== 'undefined' && serialized instanceof FormData)
      headers.delete('content-type');
    else headers.set('content-type', contentType);
    return serialized;
  }
  const media = contentType.split(';', 1)[0]!.trim().toLowerCase();
  if (media === 'application/json' || media.endsWith('+json')) {
    headers.set('content-type', contentType);
    return JSON.stringify(body);
  }
  if (media.startsWith('text/') && typeof body !== 'object') {
    headers.set('content-type', contentType);
    return String(body);
  }
  if (isNativeBody(body)) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) headers.delete('content-type');
    else headers.set('content-type', contentType);
    return body;
  }
  throw new TypeError(`Structured ${contentType} needs body extension.`);
}

async function parse(response: Response) {
  if ([204, 205, 304].includes(response.status) || response.headers.get('content-length') === '0')
    return undefined;
  const text = await response.text();
  if (!text) return undefined;
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('json')
    ? JSON.parse(text)
    : text;
}

async function executeRequest(
  runtime: Runtime,
  state: State,
  method: HttpMethod,
  input?: RequestInput,
) {
  const extensions = input?.extensions as RuntimeExtensions | undefined;
  const headers = new Headers(runtime.options.headers);
  if (input?.header) {
    if (extensions?.header)
      new Headers(extensions.header(input.header)).forEach((value, name) =>
        headers.set(name, value),
      );
    else
      for (const [k, v] of Object.entries(input.header))
        if (v != null) headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  if (input?.init?.headers)
    new Headers(input.init.headers).forEach((value, name) => headers.set(name, value));
  if (input?.cookie) {
    if (extensions?.cookie) headers.set('cookie', extensions.cookie(input.cookie));
    else {
      const cookies: string[] = [];
      for (const [k, v] of Object.entries(input.cookie)) {
        if (v == null) continue;
        if (Array.isArray(v))
          v.forEach((item) => cookies.push(`${encodeScalar(k)}=${encodeScalar(item)}`));
        else cookies.push(`${encodeScalar(k)}=${encodeScalar(v)}`);
      }
      if (cookies.length) headers.set('cookie', cookies.join('; '));
    }
  }
  let url = runtime.options.baseUrl.replace(
    /\/?(?=[?#]|$)/,
    safePath(renderPath(state, extensions?.path)),
  );
  if (input?.query)
    url = appendQuery(
      url,
      extensions?.query
        ? normalizeQuery(extensions.query(input.query))
        : serializeQuery(input.query),
    );
  let request: TransportRequest = {
    url,
    method: method,
    init: {
      ...input?.init,
      method: method.toUpperCase(),
      headers: headers,
      body: requestBody(input?.body, input?.contentType, headers, extensions?.body) ?? null,
    },
  };
  if (extensions?.request) request = await extensions.request(request, input ?? {});
  const response = await runtime.transport(request);
  let data: unknown;
  if (extensions?.response) {
    const item = await extensions.response(response);
    if (item.status !== response.status) throw new TypeError('Response status mismatch');
    data = item.data;
  } else data = await parse(response);
  const ok = response.status >= 200 && response.status < 300;
  if (runtime.options.throwOnError === false)
    return { ok, status: response.status, data, response };
  if (!ok) throw new HttpError(`HTTP ${response.status}`, response, data);
  return data;
}

function createNode(runtime: Runtime, state: State): unknown {
  return new Proxy(() => 0, {
    get(_t, property) {
      if (property === 'then') return undefined;
      if (typeof property === 'symbol') return undefined;
      if (property === '$path' && 'segments' in state && !state.segments.length)
        return (template: string, params?: Record<string, unknown>) =>
          createNode(runtime, { template, params: params });
      if (isMethod(property))
        return (input?: RequestInput) => executeRequest(runtime, state, property, input);
      if (!('segments' in state)) throw new TypeError('$path() terminal.');
      return createNode(runtime, {
        segments: [...state.segments, { dynamic: false, value: property }],
      });
    },
    apply(_t, _a, args) {
      if (!('segments' in state) || args.length !== 1)
        throw new TypeError('Path parameter needs 1 argument.');
      return createNode(runtime, {
        segments: [...state.segments, { dynamic: true, value: args[0] }],
      });
    },
  });
}

function createRuntime(options: CoreClientOptions): Runtime {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!options.transport && typeof fetchImplementation !== 'function')
    throw new TypeError('Need fetch/transport.');
  return {
    options,
    transport: options.transport ?? ((request) => fetchImplementation(request.url, request.init)),
  };
}

export function createClient<P extends OpenAPIPaths>(
  options: CoreClientOptions & { throwOnError: false },
): API<P, false, false>;
export function createClient<P extends OpenAPIPaths>(
  options: CoreClientOptions & { throwOnError?: true | undefined },
): API<P, true, false>;
export function createClient<P extends OpenAPIPaths>(
  options: CoreClientOptions,
): API<P, boolean, false>;
export function createClient<P extends OpenAPIPaths>(
  options: CoreClientOptions,
): API<P, boolean, false> {
  return createNode(createRuntime(options), { segments: [] }) as API<P, boolean, false>;
}
