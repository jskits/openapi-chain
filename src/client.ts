import { OpenAPIChainError, operationError } from './errors.js';
import { isNativeBody, isFormData, isUrlSearchParams } from './native-body.js';
import { responseExtensionData } from './response-contract.js';
import { joinUrl, appendRawQuery } from './url.js';
import { isPlainRecord } from './record.js';
/* oxlint-disable typescript/no-base-to-string -- Core scalar coercion intentionally follows String(); structured serialization uses typed extensions. */
import { stringifyJson } from './json.js';
import { safePath, safeUrl } from './path.js';
import { mediaType, isJsonMediaType, validateTextCharset } from './media.js';
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

// Static segments are strings; dynamic values are wrapped to preserve their identity.
type PathSegment = string | [unknown];
type State = PathSegment[] | { template: string; params?: Record<string, unknown> | undefined };
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

const entries = Object.entries;
const encodeScalar = (v: unknown) => encodeURIComponent(String(v));
function serializeQuery(input: Record<string, unknown>) {
  if (!isPlainRecord(input))
    throw new OpenAPIChainError('SERIALIZATION', 'Query must be a plain record.');
  const query = new URLSearchParams();
  for (const [name, value] of entries(input)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
    else if (typeof value === 'object') {
      if (!isPlainRecord(value))
        throw new OpenAPIChainError('SERIALIZATION', `Query ${name} must be a plain record.`);
      entries(value).forEach(([key, entry]) => entry != null && query.append(key, String(entry)));
    } else query.append(name, String(value));
  }
  return query.toString();
}

function renderPath(state: State, serialize?: RuntimeExtensions['path']) {
  let dynamicIndex = 0;
  const encode = (value: unknown) =>
    serialize ? safePath(serialize(value, { index: dynamicIndex++ }), true) : encodeScalar(value);
  if (!Array.isArray(state))
    return state.template.replace(/\{([^{}]+)\}/g, (_m, name: string) => {
      if (!state.params || !Object.hasOwn(state.params, name))
        throw new OpenAPIChainError('SERIALIZATION', `Missing path: ${name}`);
      return encode(state.params[name]);
    });
  return `/${state.map((segment) => (typeof segment === 'string' ? segment : encode(segment[0]))).join('/')}`;
}

function requestBody(
  body: unknown,
  contentType: string | undefined,
  headers: Headers,
  serialize?: RuntimeExtensions['body'],
) {
  if (body === undefined) return undefined;
  if (!contentType) throw new OpenAPIChainError('SERIALIZATION', 'Missing contentType.');
  if (mediaType(contentType).includes('*'))
    throw new OpenAPIChainError('SERIALIZATION', 'Request body requires a concrete contentType.');
  let serialized: BodyInit | undefined;
  if (serialize) serialized = serialize({ body, contentType });
  else {
    const media = mediaType(contentType);
    if (isJsonMediaType(media)) serialized = stringifyJson(body, `body (${contentType})`);
    else if (media.startsWith('text/') && typeof body !== 'object') serialized = String(body);
    else if (isNativeBody(body)) serialized = body;
    else throw new OpenAPIChainError('SERIALIZATION', `Need body extension: ${contentType}`);
    if (typeof serialized === 'string' || isUrlSearchParams(serialized))
      validateTextCharset(contentType);
  }
  if (isFormData(serialized)) headers.delete('content-type');
  else headers.set('content-type', contentType);
  return serialized;
}

async function executeRequest(
  runtime: Runtime,
  state: State,
  method: HttpMethod,
  input?: RequestInput,
) {
  const pathTemplate = Array.isArray(state)
    ? `/${state.map((segment) => (typeof segment === 'string' ? segment : '{}')).join('/')}`
    : state.template;
  try {
    const extensions = input?.extensions as RuntimeExtensions | undefined;
    let url = safeUrl(
      runtime.options.baseUrl,
      joinUrl(runtime.options.baseUrl, safePath(renderPath(state, extensions?.path))),
    );
    const headers = new Headers(runtime.options.headers);
    const mergeHeaders = (value: HeadersInit) =>
      new Headers(value).forEach((entry, name) => headers.set(name, entry));
    if (input?.header) {
      if (extensions?.header) mergeHeaders(extensions.header(input.header));
      else
        for (const [k, v] of entries(input.header))
          if (v != null) headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    if (input?.init?.headers) mergeHeaders(input.init.headers);
    if (input?.cookie) {
      if (extensions?.cookie) headers.set('cookie', extensions.cookie(input.cookie));
      else {
        const cookies: string[] = [];
        for (const [k, v] of entries(input.cookie)) {
          if (v == null) continue;
          (Array.isArray(v) ? v : [v]).forEach((item) =>
            cookies.push(`${encodeScalar(k)}=${encodeScalar(item)}`),
          );
        }
        if (cookies.length) headers.set('cookie', cookies.join('; '));
      }
    }
    if (input?.query)
      url = appendRawQuery(
        url,
        extensions?.query
          ? String(extensions.query(input.query)).replace(/^\?/, '')
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
    if (extensions?.request) request = await extensions.request(request, input!);
    const response = await runtime.transport(request);
    const { status } = response;
    if (status === 0) throw new TypeError('Response status 0');
    let data: unknown;
    if (extensions?.response) {
      data = responseExtensionData(await extensions.response(response), status);
    } else if (
      ![204, 205, 304].includes(status) &&
      response.headers.get('content-length') !== '0'
    ) {
      const text = await response.text();
      if (text)
        data = isJsonMediaType(mediaType(response.headers.get('content-type') ?? ''))
          ? JSON.parse(text)
          : text;
    }
    const ok = status >= 200 && status < 300;
    if (runtime.options.throwOnError === false) return { ok, status, data, response };
    if (!ok) throw new HttpError(`HTTP ${status}`, response, data);
    return data;
  } catch (error) {
    throw operationError(error, method, pathTemplate);
  }
}

function createNode(runtime: Runtime, state: State): unknown {
  return new Proxy(() => 0, {
    get(_t, property) {
      if (property === 'then') return undefined;
      if (typeof property === 'symbol') return undefined;
      if (property === '$path' && Array.isArray(state) && !state.length)
        return (template: string, params?: Record<string, unknown>) =>
          createNode(runtime, { template, params: params });
      if (httpMethods.includes(property as HttpMethod))
        return (input?: RequestInput) =>
          executeRequest(runtime, state, property as HttpMethod, input);
      if (!Array.isArray(state)) throw new TypeError('$path() terminal.');
      return createNode(runtime, [...state, property]);
    },
    apply(_t, _a, args) {
      if (!Array.isArray(state) || args.length !== 1) throw new TypeError('Path needs 1 argument.');
      return createNode(runtime, [...state, [args[0]]]);
    },
  });
}

function createRuntime(options: CoreClientOptions): Runtime {
  if (
    options.middleware !== undefined ||
    options.metadata !== undefined ||
    typeof options.headers === 'function'
  )
    throw new TypeError('Use openapi-chain/strict.');
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!options.transport && typeof fetchImplementation !== 'function')
    throw new TypeError('Missing fetch.');
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
  return createNode(createRuntime(options), []) as API<P, boolean, false>;
}
