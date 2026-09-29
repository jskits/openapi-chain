import { OpenAPIChainError, operationError } from './errors.js';
import {
  serializeQuery,
  serializeQuerystring,
  appendParameterHeaders,
  appendCookieHeader,
  validateRuntimeInput,
  buildTemplatePath,
  serializeBody,
} from './serialization.js';
import { createOperationResolver } from './routes.js';
import { safePath } from './path.js';
import { httpMethods } from './constant.js';
import { snapshotMetadata } from './metadata-contract.js';
import type { CompiledOpenAPIMetadata, HttpMethod, RequestInput } from './type.js';

/** One operation call in the shape most Fetch-style clients already have. */
export type SerializeRequestInput = {
  /** Lowercase OpenAPI method, such as `get`. */
  method: HttpMethod;
  /** Declared OpenAPI path template, such as `/items/{id}`. */
  path: string;
  params?: {
    path?: Record<string, unknown> | undefined;
    query?: Record<string, unknown> | undefined;
    querystring?: Record<string, unknown> | undefined;
    header?: Record<string, unknown> | undefined;
    cookie?: Record<string, unknown> | undefined;
  };
  body?: unknown;
  /** Concrete request media type; required when the operation declares several. */
  contentType?: string | undefined;
};

export type SerializedRequest = {
  /** Rendered path without the service base URL, such as `/items/.3,4,5`. */
  path: string;
  /** Encoded query without a leading `?`; empty when there is none. */
  query: string;
  /** Header and cookie parameters plus the body Content-Type, when one applies. */
  headers: Headers;
  /** Encoded body. Native FormData needs Fetch to generate its multipart boundary. */
  body: BodyInit | undefined;
};

/**
 * Serialize operation inputs with the strict client's OpenAPI rules without sending anything.
 * Build it once per metadata value; the operation index is created at construction.
 */
export function createRequestSerializer(
  metadata: CompiledOpenAPIMetadata,
): (input: SerializeRequestInput) => SerializedRequest {
  const snapshot = snapshotMetadata(metadata);
  const resolve = createOperationResolver(snapshot);
  const complete = snapshot.complete === true;
  return ({ method, path: template, params = {}, body, contentType }) => {
    try {
      if (!httpMethods.includes(method))
        throw new OpenAPIChainError('SERIALIZATION', `Unsupported HTTP method: ${String(method)}.`);
      const operation = resolve(
        { kind: 'template', template, params: params.path },
        method,
      ).metadata;
      const input: RequestInput = {
        ...(params.query !== undefined && { query: params.query }),
        ...(params.querystring !== undefined && { querystring: params.querystring }),
        ...(params.header !== undefined && { header: params.header }),
        ...(params.cookie !== undefined && { cookie: params.cookie }),
        ...(body !== undefined && { body }),
        ...(contentType !== undefined && { contentType }),
      };
      validateRuntimeInput(input, operation, complete);
      const path = safePath(buildTemplatePath(template, params.path, operation, undefined));
      const headers = new Headers();
      appendParameterHeaders(headers, params.header, operation, undefined);
      appendCookieHeader(headers, params.cookie, operation, undefined);
      const serializedBody = serializeBody(
        body,
        contentType,
        headers,
        operation,
        complete,
        undefined,
      );
      const query =
        params.querystring && Object.keys(params.querystring).length
          ? serializeQuerystring(params.querystring, operation, undefined)
          : params.query
            ? serializeQuery(params.query, operation, undefined)
            : '';
      return { path, query, headers, body: serializedBody };
    } catch (error) {
      throw operationError(error, method, template);
    }
  };
}
