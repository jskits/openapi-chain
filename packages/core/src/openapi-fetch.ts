import { createRequestSerializer } from './request-serializer.js';
import { isPlainRecord } from './record.js';
import type { CompiledOpenAPIMetadata, HttpMethod } from './type.js';

export type OpenAPISerializationOptions = { metadata: CompiledOpenAPIMetadata };

type HeaderValue = string | number | boolean | null | undefined | (string | number | boolean)[];
type FetchInit = {
  params?: {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    header?: Record<string, unknown>;
    cookie?: Record<string, unknown>;
  };
  body?: unknown;
  headers?: HeadersInit | Record<string, HeaderValue>;
  [option: string]: unknown;
};
type Call = (path: string, init?: FetchInit) => Promise<unknown>;
type RequestCall = (method: string, path: string, init?: FetchInit) => Promise<unknown>;

const methods = ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH', 'TRACE'];

/** openapi-fetch treats `null` as "remove this header", so records keep their own values. */
function headerRecord(headers: FetchInit['headers']): Record<string, HeaderValue> {
  if (headers === undefined) return {};
  if (isPlainRecord(headers)) return { ...(headers as Record<string, HeaderValue>) };
  return Object.fromEntries(new Headers(headers as HeadersInit));
}

/**
 * Return a view of an openapi-fetch client whose calls use openapi-chain's strict OpenAPI
 * serialization for path, query, header and cookie parameters and request bodies.
 *
 * Responses, middleware, `fetch`, `baseUrl` and every other option still belong to
 * openapi-fetch. Wrap the core client before `wrapAsPathBasedClient()` for path-based calls.
 */
export function withOpenAPISerialization<Client extends object>(
  client: Client,
  options: OpenAPISerializationOptions,
): Client {
  const serialize = createRequestSerializer(options.metadata);
  const prepare = (method: string, path: string, init: FetchInit = {}): FetchInit => {
    const { params = {}, body, headers, ...rest } = init;
    const selected = headerRecord(headers);
    const contentType = Object.entries(selected).find(
      ([name, value]) => name.toLowerCase() === 'content-type' && typeof value === 'string',
    )?.[1] as string | undefined;
    const serialized = serialize({
      method: method.toLowerCase() as HttpMethod,
      path,
      params,
      body,
      contentType,
    });
    // Serialized parameters come first so explicit call headers keep openapi-fetch precedence;
    // the body media type always comes from serialization.
    const merged: Record<string, HeaderValue> = {};
    serialized.headers.forEach((value, name) => {
      if (name !== 'content-type') merged[name] = value;
    });
    for (const [name, value] of Object.entries(selected))
      if (body === undefined || name.toLowerCase() !== 'content-type') merged[name] = value;
    // Native FormData needs Fetch to choose the boundary; `null` removes any configured value.
    if (body !== undefined)
      merged['content-type'] =
        serialized.body instanceof FormData ? null : serialized.headers.get('content-type');
    return {
      ...rest,
      // Header and cookie values are already serialized; openapi-fetch would re-append raw ones.
      params: { path: params.path ?? {}, ...(params.query && { query: params.query }) },
      headers: merged,
      ...(body !== undefined && { body, bodySerializer: () => serialized.body }),
      querySerializer: () => serialized.query,
      pathSerializer: (url: string) =>
        `${url.slice(0, url.length - path.length)}${serialized.path}`,
    };
  };
  // Async wrappers report serialization failures as rejections, like openapi-fetch calls.
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') return value;
      if (typeof property === 'string' && methods.includes(property))
        return (async (path, init) =>
          (value as Call).call(target, path, prepare(property, path, init))) as Call;
      if (property === 'request')
        return (async (method, path, init) =>
          (value as RequestCall).call(
            target,
            method,
            path,
            prepare(method, path, init),
          )) as RequestCall;
      return value;
    },
  });
}
