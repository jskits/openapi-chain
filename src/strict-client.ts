import { createOperationResolver, splitPath, type ProxyState } from './routes.js';
import { safePath } from './path.js';
import { httpMethods } from './constant.js';
import {
  HttpError,
  type API,
  type MediaTypeMetadata,
  type ClientOptions,
  type StrictClientOptions,
  type EncodingMetadata,
  type HttpMethod,
  type Middleware,
  type OpenAPIPaths,
  type OperationMetadata,
  type ParameterContentSerializer,
  type ParameterMetadata,
  type ParameterStyle,
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

const RESERVED = new Set(`:/?#[]@!$&'()*+,;=`.split(''));
const UNRESERVED = /^[A-Za-z0-9._~-]$/;

function encodeChar(char: string): string {
  return encodeURIComponent(char).replace(
    /[!'()*]/g,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeValue(value: unknown, allowReserved = false): string {
  const text = String(value);
  let result = '';
  for (const char of text) {
    if (UNRESERVED.test(char) || (allowReserved && RESERVED.has(char))) {
      result += char;
    } else {
      result += encodeChar(char);
    }
  }
  return result;
}

const QUERY_RESERVED_ALLOWED = new Set(`:/?@!$'()*,;`.split(''));

function encodeQueryComponent(value: unknown, allowReserved = false): string {
  const text = String(value);
  if (!allowReserved) return encodeValue(text);
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = String.fromCodePoint(text.codePointAt(index)!);
    index += char.length - 1;
    if (char === '%' && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
      result += text.slice(index, index + 3);
      index += 2;
      continue;
    }
    if (UNRESERVED.test(char) || QUERY_RESERVED_ALLOWED.has(char)) result += char;
    else result += encodeChar(char);
  }
  return result;
}

const PATH_RESERVED_ALLOWED = new Set(`:@!$&'()*+,;=`.split(''));

function encodePathComponent(value: unknown, allowReserved = false): string {
  const text = String(value);
  if (!allowReserved) return encodeValue(text);
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = String.fromCodePoint(text.codePointAt(index)!);
    index += char.length - 1;
    if (char === '%' && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
      result += text.slice(index, index + 3);
      index += 2;
      continue;
    }
    if (UNRESERVED.test(char) || PATH_RESERVED_ALLOWED.has(char)) result += char;
    else result += encodeChar(char);
  }
  return result;
}

function encodeFormComponent(value: unknown, allowReserved = false): string {
  const text = String(value);
  if (!allowReserved) {
    const params = new URLSearchParams();
    params.set('v', text);
    return params.toString().slice(2);
  }
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = String.fromCodePoint(text.codePointAt(index)!);
    index += char.length - 1;
    if (char === ' ') {
      result += '+';
      continue;
    }
    if (char === '%' && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
      result += text.slice(index, index + 3);
      index += 2;
      continue;
    }
    if (UNRESERVED.test(char) || QUERY_RESERVED_ALLOWED.has(char)) result += char;
    else result += encodeChar(char);
  }
  return result;
}

function splitUrlSuffix(url: string): { base: string; suffix: string } {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  return { base, suffix: `${query}${hash}` };
}

function joinUrl(baseUrl: string, path: string): string {
  const { base, suffix } = splitUrlSuffix(baseUrl);
  const normalizedBase = base.replace(/\/+$/, '');
  if (path === '/') return `${normalizedBase}/${suffix}`;
  const normalizedPath = path.replace(/^\/+/, '');
  if (!normalizedPath) return `${normalizedBase}${suffix}`;
  return `${normalizedBase}/${normalizedPath}${suffix}`;
}

function appendRawQuery(url: string, raw: string): string {
  if (!raw) return url;
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const target = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator =
    target.endsWith('?') || target.endsWith('&') ? '' : target.includes('?') ? '&' : '?';
  return `${target}${separator}${raw}${hash}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function primitive(value: unknown, context: string): string {
  if (value === null) return 'null';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new TypeError(`${context} contains a nested/unsupported value.`);
}

function encodedPrimitive(value: unknown, context: string, allowReserved = false): string {
  return encodeValue(primitive(value, context), allowReserved);
}

function objectEntries(value: Record<string, unknown>, context: string) {
  return Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, primitive(item, context)] as const);
}

function serializePathStyle(
  name: string,
  value: unknown,
  style: ParameterStyle,
  explode: boolean,
  allowReserved = false,
): string {
  const context = `path parameter ${name}`;
  const encode = (item: unknown) => encodePathComponent(item, allowReserved);
  const encodePrimitive = (item: unknown) => encode(primitive(item, context));

  if (Array.isArray(value)) {
    const items = value.map(encodePrimitive);
    if (style === 'simple') return items.join(',');
    if (style === 'label') return `.${items.join(explode ? '.' : ',')}`;
    if (style === 'matrix') {
      return explode
        ? items.map((item) => `;${encodeValue(name)}=${item}`).join('')
        : `;${encodeValue(name)}=${items.join(',')}`;
    }
    throw new TypeError(`Invalid path style ${style} for ${name}.`);
  }

  if (isPlainRecord(value)) {
    const entries = objectEntries(value, context).map(
      ([key, item]) => [encode(key), encode(item)] as const,
    );
    if (style === 'simple') {
      return explode
        ? entries.map(([key, item]) => `${key}=${item}`).join(',')
        : entries.flatMap(([key, item]) => [key, item]).join(',');
    }
    if (style === 'label') {
      return explode
        ? `.${entries.map(([key, item]) => `${key}=${item}`).join('.')}`
        : `.${entries.flatMap(([key, item]) => [key, item]).join(',')}`;
    }
    if (style === 'matrix') {
      return explode
        ? entries.map(([key, item]) => `;${key}=${item}`).join('')
        : `;${encodeValue(name)}=${entries.flatMap(([key, item]) => [key, item]).join(',')}`;
    }
    throw new TypeError(`Invalid path style ${style} for ${name}.`);
  }

  const item = encodePrimitive(value);
  if (style === 'simple') return item;
  if (style === 'label') return `.${item}`;
  if (style === 'matrix') return `;${encodeValue(name)}=${item}`;
  throw new TypeError(`Invalid path style ${style} for ${name}.`);
}

function defaultParameter(name: string, location: ParameterMetadata['in']): ParameterMetadata {
  return {
    name,
    in: location,
    style: location === 'query' || location === 'cookie' ? 'form' : 'simple',
    explode: location === 'query' || location === 'cookie',
  };
}

function serializeContentValue(
  value: unknown,
  parameter: ParameterMetadata,
  custom: ParameterContentSerializer | undefined,
): string {
  const contentType = parameter.contentType;
  if (!contentType) throw new TypeError('Missing parameter content type.');
  const normalized = contentType.split(';', 1)[0]!.trim().toLowerCase();
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return JSON.stringify(value);
  }
  if (normalized.startsWith('text/')) {
    return primitive(value, `parameter ${parameter.name}`);
  }
  if (custom) return custom({ value, contentType, parameter });
  throw new TypeError(
    `Parameter ${parameter.name} uses ${contentType}; provide an operation-local location extension.`,
  );
}

function serializePathParameter(
  name: string,
  value: unknown,
  metadata: ParameterMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): string {
  const parameter = metadata ?? defaultParameter(name, 'path');
  if (parameter.contentType) {
    return encodePathComponent(
      serializeContentValue(value, parameter, customContent),
      parameter.allowReserved === true,
    );
  }
  return serializePathStyle(
    name,
    value,
    parameter.style,
    parameter.explode,
    parameter.allowReserved === true,
  );
}

function serializeStyledPairs(
  name: string,
  value: unknown,
  style: ParameterStyle,
  explode: boolean,
  context: string,
): Array<[string, string]> {
  if (style === 'deepObject') {
    if (!isPlainRecord(value)) {
      throw new TypeError(`deepObject ${context} must be an object.`);
    }
    return objectEntries(value, context).map(([key, item]) => [`${name}[${key}]`, item]);
  }

  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (explode) throw new TypeError(`${style} ${context} requires explode=false.`);
    const delimiter = style === 'spaceDelimited' ? ' ' : '|';
    if (Array.isArray(value)) {
      return [[name, value.map((item) => primitive(item, context)).join(delimiter)]];
    }
    if (isPlainRecord(value)) {
      return [
        [
          name,
          objectEntries(value, context)
            .flatMap(([key, item]) => [key, item])
            .join(delimiter),
        ],
      ];
    }
    throw new TypeError(`${style} ${context} must be an array or object.`);
  }

  if (style !== 'form') throw new TypeError(`Invalid form/query style ${style}.`);
  if (Array.isArray(value)) {
    const values = value.map((item) => primitive(item, context));
    return explode ? values.map((item) => [name, item]) : [[name, values.join(',')]];
  }
  if (isPlainRecord(value)) {
    const entries = objectEntries(value, context);
    return explode
      ? entries.map(([key, item]) => [key, item])
      : [[name, entries.flatMap(([key, item]) => [key, item]).join(',')]];
  }
  return [[name, primitive(value, context)]];
}

function serializeQueryParameter(
  name: string,
  value: unknown,
  metadata: ParameterMetadata,
  customContent: ParameterContentSerializer | undefined,
): string[] {
  const allowReserved = metadata.allowReserved === true;
  if (metadata.contentType) {
    return [
      `${encodeValue(metadata.name)}=${encodeQueryComponent(
        serializeContentValue(value, metadata, customContent),
        allowReserved,
      )}`,
    ];
  }

  const context = `query parameter ${name}`;
  const style = metadata.style;
  const explode = metadata.explode;
  if (style === 'deepObject') {
    return serializeStyledPairs(metadata.name, value, style, explode, context).map(
      ([partName, partValue]) =>
        `${encodeValue(partName)}=${encodeQueryComponent(partValue, allowReserved)}`,
    );
  }
  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (explode) throw new TypeError(`${style} query parameter ${name} requires explode=false.`);
    const delimiter = style === 'spaceDelimited' ? '%20' : '%7C';
    let items: string[];
    if (Array.isArray(value)) {
      items = value.map((item) => encodeQueryComponent(primitive(item, context), allowReserved));
    } else if (isPlainRecord(value)) {
      items = objectEntries(value, context).flatMap(([key, item]) => [
        encodeQueryComponent(key, allowReserved),
        encodeQueryComponent(item, allowReserved),
      ]);
    } else {
      throw new TypeError(`${style} query parameter ${name} must be an array or object.`);
    }
    return [`${encodeValue(metadata.name)}=${items.join(delimiter)}`];
  }
  if (style !== 'form') {
    throw new TypeError(`Invalid query style ${style} for ${name}.`);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) =>
      encodeQueryComponent(primitive(item, context), allowReserved),
    );
    return explode
      ? items.map((item) => `${encodeValue(metadata.name)}=${item}`)
      : [`${encodeValue(metadata.name)}=${items.join(',')}`];
  }
  if (isPlainRecord(value)) {
    const entries = objectEntries(value, context).map(
      ([key, item]) =>
        [
          encodeQueryComponent(key, allowReserved),
          encodeQueryComponent(item, allowReserved),
        ] as const,
    );
    return explode
      ? entries.map(([key, item]) => `${key}=${item}`)
      : [
          `${encodeValue(metadata.name)}=${entries
            .flatMap(([key, item]) => [key, item])
            .join(',')}`,
        ];
  }
  return [
    `${encodeValue(metadata.name)}=${encodeQueryComponent(
      primitive(value, context),
      allowReserved,
    )}`,
  ];
}

function serializeQuery(
  query: Record<string, unknown>,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): string {
  const fragments: string[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    const metadata = operation?.parameters?.query?.[name] ?? defaultParameter(name, 'query');
    fragments.push(...serializeQueryParameter(name, value, metadata, customContent));
  }
  return fragments.join('&');
}

function serializeQuerystring(
  values: Record<string, unknown>,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): string {
  const parameters = operation?.parameters?.querystring;
  const entries = parameters ? Object.values(parameters) : [];
  if (entries.length !== 1) {
    throw new TypeError(
      'querystring input requires compiled OpenAPI 3.2 metadata with exactly one in: querystring parameter.',
    );
  }
  const parameter = entries[0]!;
  if (!parameter.contentType) {
    throw new TypeError(`querystring parameter ${parameter.name} is missing content metadata.`);
  }
  const value = Object.prototype.hasOwnProperty.call(values, parameter.name)
    ? values[parameter.name]
    : values;
  if (value === undefined) return '';

  const normalized = normalizeMediaType(parameter.contentType);
  if (normalized === 'application/x-www-form-urlencoded') {
    if (parameter.media?.requiresCustomSerializer) {
      throw new TypeError(
        `${parameter.media.requiresCustomSerializer} Use the operation querystring extension to serialize the whole query string.`,
      );
    }
    return serializeUrlEncodedBody(value, operation, parameter.contentType, parameter.media);
  }

  const serialized = serializeContentValue(value, parameter, customContent);
  return encodeQueryComponent(serialized);
}

function serializeSimpleHeader(name: string, value: unknown, explode: boolean): string {
  const context = `header parameter ${name}`;
  if (Array.isArray(value)) {
    return value.map((item) => primitive(item, context)).join(',');
  }
  if (isPlainRecord(value)) {
    const entries = objectEntries(value, context);
    return explode
      ? entries.map(([key, item]) => `${key}=${item}`).join(',')
      : entries.flatMap(([key, item]) => [key, item]).join(',');
  }
  return primitive(value, context);
}

function appendParameterHeaders(
  headers: Headers,
  values: Record<string, unknown> | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): void {
  if (!values) return;
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const declaredHeaders = operation?.parameters?.header;
    const metadata =
      declaredHeaders?.[name] ??
      Object.values(declaredHeaders ?? {}).find((parameter) =>
        parameterNameEquals('header', name, parameter.name),
      ) ??
      defaultParameter(name, 'header');
    const serialized = metadata.contentType
      ? serializeContentValue(value, metadata, customContent)
      : serializeSimpleHeader(name, value, metadata.explode);
    headers.set(metadata.name, serialized);
  }
}

function cookieParts(
  name: string,
  value: unknown,
  metadata: ParameterMetadata,
  customContent: ParameterContentSerializer | undefined,
): string[] {
  if (metadata.contentType) {
    return [`${metadata.name}=${serializeContentValue(value, metadata, customContent)}`];
  }

  const context = `cookie parameter ${name}`;
  if (metadata.style === 'cookie') {
    if (!metadata.explode) {
      throw new TypeError(`OAS 3.2 cookie style parameter ${name} requires explode=true.`);
    }
    if (Array.isArray(value)) {
      return value.map((item) => `${metadata.name}=${primitive(item, context)}`);
    }
    if (isPlainRecord(value)) {
      return objectEntries(value, context).map(([key, item]) => `${key}=${item}`);
    }
    return [`${metadata.name}=${primitive(value, context)}`];
  }

  if (metadata.style !== 'form') {
    throw new TypeError(`Invalid cookie style ${metadata.style} for ${name}.`);
  }

  if (Array.isArray(value) || isPlainRecord(value)) {
    throw new TypeError(
      `Cookie style form cannot faithfully represent compound parameter ${name} in a Cookie header. ` +
        'Use OpenAPI 3.2 style: cookie, Parameter content, or an operation cookie extension.',
    );
  }
  return [
    `${encodeValue(metadata.name)}=${encodedPrimitive(value, context, metadata.allowReserved)}`,
  ];
}

function parameterNameEquals(
  location: ParameterMetadata['in'],
  left: string,
  right: string,
): boolean {
  return location === 'header' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function validateParameterLocation(
  location: ParameterMetadata['in'],
  values: Record<string, unknown> | undefined,
  operation: OperationMetadata | undefined,
  completeMetadata: boolean,
): void {
  if (!completeMetadata) return;
  const declared = operation?.parameters?.[location] ?? {};
  const supplied = values ?? {};
  const declaredEntries = Object.values(declared);

  const extras = Object.keys(supplied).filter(
    (name) =>
      !declaredEntries.some((parameter) => parameterNameEquals(location, name, parameter.name)),
  );
  if (extras.length) {
    throw new TypeError(
      `Compiled OpenAPI metadata does not declare ${location} parameter(s): ${extras.join(', ')}.`,
    );
  }

  const missing = declaredEntries
    .filter((parameter) => parameter.required)
    .filter(
      (parameter) =>
        !Object.entries(supplied).some(
          ([name, value]) =>
            value !== undefined && parameterNameEquals(location, name, parameter.name),
        ),
    )
    .map((parameter) => parameter.name);
  if (missing.length) {
    throw new TypeError(
      `Missing required OpenAPI ${location} parameter(s): ${missing.join(', ')}.`,
    );
  }
}

function validateRuntimeInput(
  input: RequestInput | undefined,
  operation: OperationMetadata | undefined,
  completeMetadata: boolean,
): void {
  if (input?.body === undefined && input?.contentType !== undefined) {
    throw new TypeError('Request contentType cannot be provided without a request body.');
  }
  if (completeMetadata && operation?.requestBody?.required && input?.body === undefined) {
    throw new TypeError('Missing required OpenAPI request body.');
  }
  validateParameterLocation('query', input?.query, operation, completeMetadata);
  validateParameterLocation('querystring', input?.querystring, operation, completeMetadata);
  validateParameterLocation('header', input?.header, operation, completeMetadata);
  validateParameterLocation('cookie', input?.cookie, operation, completeMetadata);
}

function appendCookieHeader(
  headers: Headers,
  values: Record<string, unknown> | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): void {
  if (!values) return;
  const parts: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const metadata = operation?.parameters?.cookie?.[name] ?? defaultParameter(name, 'cookie');
    parts.push(...cookieParts(name, value, metadata, customContent));
  }
  if (parts.length) headers.set('cookie', parts.join('; '));
}

function buildTemplatePath(
  template: string,
  params: Record<string, unknown> | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
  customPath?: RuntimeOperationExtensions['path'],
): string {
  const names = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
  if (!names.length) {
    if (params && Object.keys(params).length) {
      throw new TypeError(`Path ${template} does not accept path parameters.`);
    }
    return template;
  }
  if (params) {
    const extras = Object.keys(params).filter((name) => !names.includes(name));
    if (extras.length) {
      throw new TypeError(
        `Path ${template} received unexpected parameter(s): ${extras.join(', ')}.`,
      );
    }
  }
  let index = 0;
  return template.replace(/\{([^{}]+)\}/g, (_match, name: string) => {
    if (!params || !Object.hasOwn(params, name)) {
      throw new TypeError(`Missing path parameter: ${name}`);
    }
    return customPath
      ? customPath(params[name], { index: index++ })
      : serializePathParameter(
          name,
          params[name],
          operation?.parameters?.path?.[name],
          customContent,
        );
  });
}

function buildChainPath(
  state: Extract<ProxyState, { kind: 'chain' }>,
  template: string | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
  customPath?: RuntimeOperationExtensions['path'],
): string {
  if (template) {
    const templateSegments = splitPath(template);
    let dynamicIndex = 0;
    const rendered = templateSegments.map((segment, index) => {
      const actual = state.segments[index]!;
      const match = /^\{([^{}]+)\}$/.exec(segment);
      if (!match) return segment;
      const name = match[1]!;
      if (!actual || actual.kind !== 'dynamic') {
        throw new TypeError(`Missing dynamic path value for ${name}.`);
      }
      return customPath
        ? customPath(actual.value, { index: dynamicIndex++ })
        : serializePathParameter(
            name,
            actual.value,
            operation?.parameters?.path?.[name],
            customContent,
          );
    });
    return rendered.length ? `/${rendered.join('/')}` : '/';
  }

  if (!state.segments.length) return '/';
  let index = 0;
  return `/${state.segments
    .map((segment) =>
      segment.kind === 'static'
        ? segment.value
        : customPath
          ? customPath(segment.value, { index: index++ })
          : serializePathStyle('value', segment.value, 'simple', false),
    )
    .join('/')}`;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer;
}

function isUrlSearchParams(value: unknown): value is URLSearchParams {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams;
}

function isNativeBody(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    isBlob(value) ||
    isFormData(value) ||
    isArrayBuffer(value) ||
    (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) ||
    isUrlSearchParams(value)
  );
}

function normalizeMediaType(contentType: string): string {
  return contentType.split(';', 1)[0]!.trim().toLowerCase();
}

function findMediaMetadata(operation: OperationMetadata | undefined, contentType: string) {
  const media = operation?.requestBody?.media;
  if (!media) return undefined;
  if (media[contentType]) return media[contentType];
  const normalized = normalizeMediaType(contentType);
  const exact = Object.keys(media).find(
    (candidate) => normalizeMediaType(candidate) === normalized,
  );
  if (exact) return media[exact];
  const ranges = Object.keys(media)
    .filter((candidate) => mediaTypeRangeMatches(candidate, contentType))
    .sort((a, b) => mediaTypeRangeSpecificity(b) - mediaTypeRangeSpecificity(a));
  return ranges.length ? media[ranges[0]!] : undefined;
}

function mediaTypeRangeSpecificity(range: string): number {
  const normalized = normalizeMediaType(range);
  if (normalized === '*/*') return 0;
  return normalized.endsWith('/*') ? 1 : 2;
}

function isConcreteMediaType(contentType: string): boolean {
  return !normalizeMediaType(contentType).includes('*');
}

function requestBodyAcceptsMediaType(
  operation: OperationMetadata | undefined,
  contentType: string,
): boolean {
  return (operation?.requestBody?.mediaTypes ?? []).some((candidate) =>
    mediaTypeRangeMatches(candidate, contentType),
  );
}

function runtimeDefaultPartContentType(value: unknown): string {
  if (isBlob(value)) return value.type || 'application/octet-stream';
  if (isArrayBuffer(value) || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))) {
    return 'application/octet-stream';
  }
  if (Array.isArray(value)) {
    return value.length ? runtimeDefaultPartContentType(value[0]) : 'text/plain';
  }
  if (isPlainRecord(value)) return 'application/json';
  return 'text/plain';
}

function formContentString(value: unknown, contentType: string, context: string): string {
  const normalized = normalizeMediaType(contentType);
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return JSON.stringify(value);
  }
  if (normalized.startsWith('text/')) {
    return primitive(value, context);
  }
  if (normalized === 'application/octet-stream' && typeof value === 'string') {
    return value;
  }
  throw new TypeError(
    `${context} uses ${contentType}; provide an operation body extension to serialize the whole request body.`,
  );
}

function serializeFormStyleFragments(
  name: string,
  value: unknown,
  encoding: EncodingMetadata,
): string[] {
  const style = encoding.style ?? 'form';
  const explode = encoding.explode ?? style === 'form';
  const allowReserved = encoding.allowReserved === true;
  const context = `form field ${name}`;
  // Style-based Encoding Object serialization follows RFC6570/RFC3986. It is
  // not the HTML form algorithm: spaces are %20, not '+'.
  const encode = (item: unknown) => encodeQueryComponent(item, allowReserved);

  if (style === 'deepObject') {
    if (!explode) throw new TypeError(`deepObject form field ${name} requires explode=true.`);
    return serializeStyledPairs(name, value, style, explode, context).map(
      ([partName, partValue]) => `${encodeQueryComponent(partName)}=${encode(partValue)}`,
    );
  }

  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (explode) throw new TypeError(`${style} form field ${name} requires explode=false.`);
    const delimiter = style === 'spaceDelimited' ? '%20' : '%7C';
    let items: string[];
    if (Array.isArray(value)) {
      items = value.map((item) => encode(primitive(item, context)));
    } else if (isPlainRecord(value)) {
      items = objectEntries(value, context).flatMap(([key, item]) => [encode(key), encode(item)]);
    } else {
      throw new TypeError(`${style} form field ${name} must be an array or object.`);
    }
    return [`${encodeQueryComponent(name)}=${items.join(delimiter)}`];
  }

  if (style !== 'form') {
    throw new TypeError(`Invalid form encoding style ${style} for ${name}.`);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => encode(primitive(item, context)));
    return explode
      ? items.map((item) => `${encodeQueryComponent(name)}=${item}`)
      : [`${encodeQueryComponent(name)}=${items.join(',')}`];
  }
  if (isPlainRecord(value)) {
    const entries = objectEntries(value, context).map(
      ([key, item]) => [encode(key), encode(item)] as const,
    );
    return explode
      ? entries.map(([key, item]) => `${key}=${item}`)
      : [
          `${encodeQueryComponent(name)}=${entries
            .flatMap(([key, item]) => [key, item])
            .join(',')}`,
        ];
  }
  return [`${encodeQueryComponent(name)}=${encode(primitive(value, context))}`];
}

function serializeUrlEncodedBody(
  body: unknown,
  operation: OperationMetadata | undefined,
  contentType: string,
  mediaOverride?: MediaTypeMetadata,
): string {
  if (isUrlSearchParams(body)) return body.toString();
  if (!isPlainRecord(body)) {
    throw new TypeError(`${contentType} request body must be an object or URLSearchParams.`);
  }

  const media = mediaOverride ?? findMediaMetadata(operation, contentType);
  const fragments: string[] = [];
  for (const [name, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const encoding = media?.encoding?.[name];
    if (encoding?.styleBased) {
      fragments.push(...serializeFormStyleFragments(name, value, encoding));
      continue;
    }

    const fieldContentType =
      encoding?.contentType ??
      media?.propertyContentTypes?.[name] ??
      runtimeDefaultPartContentType(value);
    const appendContentValue = (item: unknown) => {
      const serialized =
        media?.propertyKinds?.[name] === 'binary' && typeof item === 'string'
          ? item
          : formContentString(item, fieldContentType, `form field ${name}`);
      fragments.push(`${encodeFormComponent(name)}=${encodeFormComponent(serialized)}`);
    };
    if (Array.isArray(value)) {
      for (const item of value) appendContentValue(item);
    } else {
      appendContentValue(value);
    }
  }
  return fragments.join('&');
}

function mediaTypeRangeMatches(range: string, actual: string): boolean {
  const expected = normalizeMediaType(range);
  const value = normalizeMediaType(actual);
  if (expected === value || expected === '*/*') return true;
  const slash = expected.indexOf('/');
  return slash > 0 && expected.endsWith('/*') && value.startsWith(`${expected.slice(0, slash)}/`);
}

function selectMultipartContentType(contentTypes: string): string {
  const choices = contentTypes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (choices.length <= 1) return choices[0] ?? 'application/octet-stream';
  throw new TypeError(
    `Multipart part declares multiple content types (${contentTypes}); ` +
      'provide an operation body extension to choose the intended media type explicitly.',
  );
}

function appendMultipartContentPart(
  form: FormData,
  name: string,
  value: unknown,
  contentType: string,
): void {
  contentType = selectMultipartContentType(contentType);
  const normalized = normalizeMediaType(contentType);
  if (isBlob(value)) {
    form.append(
      name,
      value.type === contentType ? value : new Blob([value], { type: contentType }),
    );
    return;
  }
  if (isArrayBuffer(value) || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))) {
    form.append(name, new Blob([value as BlobPart], { type: contentType }));
    return;
  }
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    form.append(name, new Blob([JSON.stringify(value)], { type: contentType }));
    return;
  }
  if (normalized.startsWith('text/')) {
    const text = primitive(value, `multipart field ${name}`);
    if (normalized === 'text/plain') form.append(name, text);
    else form.append(name, new Blob([text], { type: contentType }));
    return;
  }

  throw new TypeError(
    `Multipart field ${name} uses ${contentType}; provide an operation body extension to serialize the whole request body.`,
  );
}

function appendMultipartStyleParts(
  form: FormData,
  name: string,
  value: unknown,
  encoding: EncodingMetadata,
): void {
  const style = encoding.style ?? 'form';
  const explode = encoding.explode ?? style === 'form';
  if (style === 'deepObject' && !explode) {
    throw new TypeError(`deepObject multipart field ${name} requires explode=true.`);
  }
  if ((style === 'spaceDelimited' || style === 'pipeDelimited') && explode) {
    throw new TypeError(`${style} multipart field ${name} requires explode=false.`);
  }
  for (const [partName, partValue] of serializeStyledPairs(
    name,
    value,
    style,
    explode,
    `multipart field ${name}`,
  )) {
    // Encoding style applies the same value transformation as Parameter serialization,
    // but multipart field names/values are not URI percent-encoded.
    form.append(partName, partValue);
  }
}

function serializeMultipartBody(
  body: unknown,
  operation: OperationMetadata | undefined,
  contentType: string,
): FormData {
  if (isFormData(body)) return body;
  if (!isPlainRecord(body)) {
    throw new TypeError(`${contentType} request body must be an object or FormData.`);
  }
  const media = findMediaMetadata(operation, contentType);
  const form = new FormData();

  for (const [name, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const encoding = media?.encoding?.[name];
    if (encoding?.hasHeaders) {
      throw new TypeError(
        `Multipart encoding.headers for ${name} cannot be represented by native FormData. ` +
          'Use an operation body extension or a custom transport.',
      );
    }
    if (encoding?.styleBased) {
      appendMultipartStyleParts(form, name, value, encoding);
      continue;
    }

    const partType =
      encoding?.contentType ??
      media?.propertyContentTypes?.[name] ??
      runtimeDefaultPartContentType(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        appendMultipartContentPart(form, name, item, partType);
      }
    } else {
      appendMultipartContentPart(form, name, value, partType);
    }
  }
  return form;
}

function serializeBody(
  body: unknown,
  requestedContentType: string | undefined,
  headers: Headers,
  operation: OperationMetadata | undefined,
  completeMetadata: boolean,
  customBody: RequestBodySerializer | undefined,
): BodyInit | undefined {
  if (body === undefined) return undefined;

  let contentType = requestedContentType ?? headers.get('content-type') ?? undefined;
  if (completeMetadata && !operation?.requestBody) {
    throw new TypeError(
      'Compiled OpenAPI metadata does not declare a request body for this operation.',
    );
  }
  const declaredMediaTypes = operation?.requestBody?.mediaTypes ?? [];
  if (
    !contentType &&
    completeMetadata &&
    declaredMediaTypes.length === 1 &&
    isConcreteMediaType(declaredMediaTypes[0]!)
  ) {
    contentType = declaredMediaTypes[0]!;
  }
  if (!contentType && isFormData(body)) contentType = 'multipart/form-data';
  if (!contentType && isBlob(body) && body.type) contentType = body.type;
  if (!contentType) {
    throw new TypeError(
      'Request body contentType is required without compiled single-concrete-media OpenAPI metadata.',
    );
  }
  if (!isConcreteMediaType(contentType)) {
    throw new TypeError(
      `Request body content type ${contentType} is a media range; provide a concrete media type.`,
    );
  }
  if (completeMetadata && !requestBodyAcceptsMediaType(operation, contentType)) {
    throw new TypeError(
      `Request body content type ${contentType} is not declared by the compiled OpenAPI operation.`,
    );
  }

  const normalized = normalizeMediaType(contentType);
  const media = findMediaMetadata(operation, contentType);
  if (customBody) {
    const serialized = customBody({ body, contentType, ...(operation ? { operation } : {}) });
    if (isFormData(serialized)) headers.delete('content-type');
    else headers.set('content-type', contentType);
    return serialized;
  }
  if (media?.requiresCustomSerializer) {
    throw new TypeError(media.requiresCustomSerializer);
  }
  if (normalized === 'multipart/form-data') {
    headers.delete('content-type');
    return serializeMultipartBody(body, operation, contentType);
  }
  if (normalized === 'application/x-www-form-urlencoded') {
    headers.set('content-type', contentType);
    return serializeUrlEncodedBody(body, operation, contentType);
  }
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    headers.set('content-type', contentType);
    return JSON.stringify(body);
  }
  if (normalized.startsWith('text/')) {
    headers.set('content-type', contentType);
    if (typeof body === 'string') return body;
    if (isBlob(body)) return body;
    if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
      return String(body);
    }
    throw new TypeError(`Structured ${contentType} body requires an operation body extension.`);
  }

  if (isNativeBody(body)) {
    if (isFormData(body)) {
      throw new TypeError(`FormData cannot be sent as ${contentType}; use multipart/form-data.`);
    }
    headers.set('content-type', contentType);
    return body;
  }
  throw new TypeError(`Structured ${contentType} body requires an operation body extension.`);
}

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
