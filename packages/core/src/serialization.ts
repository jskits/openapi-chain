import { OpenAPIChainError } from './errors.js';
import { mediaRangeMatches, selectMediaDeclaration, splitMediaRanges } from './media-range.js';
import {
  isBlob,
  isFormData,
  isArrayBuffer,
  isUrlSearchParams,
  isNativeBody,
  isFile,
} from './native-body.js';
export { joinUrl, appendRawQuery } from './url.js';
import { isPlainRecord } from './record.js';
import { stringifyJson } from './json.js';
import { safePath } from './path.js';
import { validateTextCharset } from './media.js';
import { splitPath, type ProxyState } from './routes.js';
import type {
  EncodingMetadata,
  MediaTypeMetadata,
  OperationMetadata,
  ParameterContentSerializer,
  ParameterMetadata,
  ParameterStyle,
  RequestBodySerializer,
  RequestInput,
} from './type.js';
type PathSerializer = (value: unknown, context: { index: number }) => string;

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
  throw new OpenAPIChainError('SERIALIZATION', `${context} contains a nested/unsupported value.`);
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
    throw new OpenAPIChainError('SERIALIZATION', `Invalid path style ${style} for ${name}.`);
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
    throw new OpenAPIChainError('SERIALIZATION', `Invalid path style ${style} for ${name}.`);
  }

  const item = encodePrimitive(value);
  if (style === 'simple') return item;
  if (style === 'label') return `.${item}`;
  if (style === 'matrix') return `;${encodeValue(name)}=${item}`;
  throw new OpenAPIChainError('SERIALIZATION', `Invalid path style ${style} for ${name}.`);
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
  if (!contentType) throw new OpenAPIChainError('SERIALIZATION', 'Missing parameter content type.');
  const normalized = contentType.split(';', 1)[0]!.trim().toLowerCase();
  validateTextCharset(contentType);
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return stringifyJson(value, `${parameter.in} parameter ${parameter.name} (${contentType})`);
  }
  if (normalized.startsWith('text/')) {
    return primitive(value, `parameter ${parameter.name}`);
  }
  if (custom) return custom({ value, contentType, parameter });
  throw new OpenAPIChainError(
    'SERIALIZATION',
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
      throw new OpenAPIChainError('SERIALIZATION', `deepObject ${context} must be an object.`);
    }
    return objectEntries(value, context).map(([key, item]) => [`${name}[${key}]`, item]);
  }

  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (explode)
      throw new OpenAPIChainError('SERIALIZATION', `${style} ${context} requires explode=false.`);
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
    throw new OpenAPIChainError('SERIALIZATION', `${style} ${context} must be an array or object.`);
  }

  if (style !== 'form')
    throw new OpenAPIChainError('SERIALIZATION', `Invalid form/query style ${style}.`);
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
    if (explode)
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `${style} query parameter ${name} requires explode=false.`,
      );
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
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `${style} query parameter ${name} must be an array or object.`,
      );
    }
    return [`${encodeValue(metadata.name)}=${items.join(delimiter)}`];
  }
  if (style !== 'form') {
    throw new OpenAPIChainError('SERIALIZATION', `Invalid query style ${style} for ${name}.`);
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

export function serializeQuery(
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

export function serializeQuerystring(
  values: Record<string, unknown>,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
): string {
  const parameters = operation?.parameters?.querystring;
  const entries = parameters ? Object.values(parameters) : [];
  if (entries.length !== 1) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      'querystring input requires compiled OpenAPI 3.2 metadata with exactly one in: querystring parameter.',
    );
  }
  const parameter = entries[0]!;
  if (!parameter.contentType) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `querystring parameter ${parameter.name} is missing content metadata.`,
    );
  }
  const value = Object.prototype.hasOwnProperty.call(values, parameter.name)
    ? values[parameter.name]
    : values;
  if (value === undefined) return '';

  const normalized = normalizeMediaType(parameter.contentType);
  if (normalized === 'application/x-www-form-urlencoded') {
    if (
      parameter.media?.requiresCustomSerializer &&
      parameter.media.customSerializerScope !== 'multipart'
    ) {
      throw new OpenAPIChainError(
        'SERIALIZATION',
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

export function appendParameterHeaders(
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
    // explode does not change primitive values; only compound values need it.
    if (!metadata.explode && (Array.isArray(value) || isPlainRecord(value))) {
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `Non-exploded OAS 3.2 cookie style for compound parameter ${name} is not supported; ` +
          'use explode=true, Parameter content, or an operation cookie extension.',
      );
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Invalid cookie style ${metadata.style} for ${name}.`,
    );
  }

  if (Array.isArray(value) || isPlainRecord(value)) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
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
  if (values !== undefined && !isPlainRecord(values))
    throw new OpenAPIChainError('SERIALIZATION', `Request ${location} input must be an object.`);
  const declared = operation?.parameters?.[location] ?? {};
  const supplied = values ?? {};
  const declaredEntries = Object.values(declared);

  const extras = Object.keys(supplied).filter(
    (name) =>
      !declaredEntries.some((parameter) => parameterNameEquals(location, name, parameter.name)),
  );
  if (extras.length) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Missing required OpenAPI ${location} parameter(s): ${missing.join(', ')}.`,
    );
  }
}

export function validateRuntimeInput(
  input: RequestInput | undefined,
  operation: OperationMetadata | undefined,
  completeMetadata: boolean,
): void {
  if (input !== undefined && !isPlainRecord(input))
    throw new OpenAPIChainError('SERIALIZATION', 'Request input must be an object.');
  if (input?.query !== undefined && input?.querystring !== undefined)
    throw new OpenAPIChainError(
      'SERIALIZATION',
      'OpenAPI query and querystring parameters cannot be used together.',
    );
  if (input?.body !== undefined && completeMetadata && !operation?.requestBody)
    throw new OpenAPIChainError(
      'SERIALIZATION',
      'Compiled OpenAPI metadata does not declare a request body for this operation.',
    );
  if (input?.body !== undefined && input.contentType !== undefined)
    validateRequestContentType(input.contentType, operation, completeMetadata);
  if (input?.body === undefined && input?.contentType !== undefined) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      'Request contentType cannot be provided without a request body.',
    );
  }
  if (completeMetadata && operation?.requestBody?.required && input?.body === undefined) {
    throw new OpenAPIChainError('SERIALIZATION', 'Missing required OpenAPI request body.');
  }
  validateParameterLocation('query', input?.query, operation, completeMetadata);
  validateParameterLocation('querystring', input?.querystring, operation, completeMetadata);
  validateParameterLocation('header', input?.header, operation, completeMetadata);
  validateParameterLocation('cookie', input?.cookie, operation, completeMetadata);
}

export function appendCookieHeader(
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

/** Serialized path values follow the same non-empty segment rule as path extensions. */
function pathValue(value: string): string {
  if (!value)
    throw new OpenAPIChainError('UNSAFE_PATH', 'Unsafe path delimiter or empty path segment.');
  return value;
}

export function buildTemplatePath(
  template: string,
  params: Record<string, unknown> | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
  customPath?: PathSerializer,
): string {
  const names = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
  if (!names.length) {
    if (params && Object.keys(params).length) {
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `Path ${template} does not accept path parameters.`,
      );
    }
    return template;
  }
  if (params) {
    const extras = Object.keys(params).filter((name) => !names.includes(name));
    if (extras.length) {
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `Path ${template} received unexpected parameter(s): ${extras.join(', ')}.`,
      );
    }
  }
  let index = 0;
  return template.replace(/\{([^{}]+)\}/g, (_match, name: string) => {
    if (!params || !Object.hasOwn(params, name)) {
      throw new OpenAPIChainError('SERIALIZATION', `Missing path parameter: ${name}`);
    }
    return customPath
      ? safePath(customPath(params[name], { index: index++ }), true)
      : pathValue(
          serializePathParameter(
            name,
            params[name],
            operation?.parameters?.path?.[name],
            customContent,
          ),
        );
  });
}

export function buildChainPath(
  state: Extract<ProxyState, { kind: 'chain' }>,
  template: string | undefined,
  operation: OperationMetadata | undefined,
  customContent: ParameterContentSerializer | undefined,
  customPath?: PathSerializer,
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
        throw new OpenAPIChainError('SERIALIZATION', `Missing dynamic path value for ${name}.`);
      }
      return customPath
        ? safePath(customPath(actual.value, { index: dynamicIndex++ }), true)
        : pathValue(
            serializePathParameter(
              name,
              actual.value,
              operation?.parameters?.path?.[name],
              customContent,
            ),
          );
    });
    return rendered.length ? `/${rendered.join('/')}${template.endsWith('/') ? '/' : ''}` : '/';
  }

  if (!state.segments.length) return '/';
  let index = 0;
  return `/${state.segments
    .map((segment) =>
      segment.kind === 'static'
        ? segment.value
        : customPath
          ? safePath(customPath(segment.value, { index: index++ }), true)
          : pathValue(serializePathStyle('value', segment.value, 'simple', false)),
    )
    .join('/')}`;
}

function normalizeMediaType(contentType: string): string {
  return contentType.split(';', 1)[0]!.trim().toLowerCase();
}

function findMediaMetadata(operation: OperationMetadata | undefined, contentType: string) {
  const body = operation?.requestBody;
  const media = body?.media;
  if (!media) return undefined;
  // Select the declaration before looking up optional serialization metadata.
  // An exact declaration with no extra rules must shadow a broader declaration.
  const declarations = [...new Set([...(body?.mediaTypes ?? []), ...Object.keys(media)])];
  const selected = selectMediaDeclaration(declarations, contentType);
  return selected === undefined ? undefined : media[selected];
}

function isConcreteMediaType(contentType: string): boolean {
  return !normalizeMediaType(contentType).includes('*');
}

function requestBodyAcceptsMediaType(
  operation: OperationMetadata | undefined,
  contentType: string,
): boolean {
  return (
    selectMediaDeclaration(operation?.requestBody?.mediaTypes ?? [], contentType) !== undefined
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
  validateTextCharset(contentType);
  const normalized = normalizeMediaType(contentType);
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return stringifyJson(value, `${context} (${contentType})`);
  }
  if (normalized.startsWith('text/')) {
    return primitive(value, context);
  }
  if (normalized === 'application/octet-stream' && typeof value === 'string') {
    return value;
  }
  throw new OpenAPIChainError(
    'SERIALIZATION',
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
    if (!explode)
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `deepObject form field ${name} requires explode=true.`,
      );
    return serializeStyledPairs(name, value, style, explode, context).map(
      ([partName, partValue]) => `${encodeQueryComponent(partName)}=${encode(partValue)}`,
    );
  }

  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (explode)
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `${style} form field ${name} requires explode=false.`,
      );
    const delimiter = style === 'spaceDelimited' ? '%20' : '%7C';
    let items: string[];
    if (Array.isArray(value)) {
      items = value.map((item) => encode(primitive(item, context)));
    } else if (isPlainRecord(value)) {
      items = objectEntries(value, context).flatMap(([key, item]) => [encode(key), encode(item)]);
    } else {
      throw new OpenAPIChainError(
        'SERIALIZATION',
        `${style} form field ${name} must be an array or object.`,
      );
    }
    return [`${encodeQueryComponent(name)}=${items.join(delimiter)}`];
  }

  if (style !== 'form') {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Invalid form encoding style ${style} for ${name}.`,
    );
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
  validateTextCharset(contentType);
  if (isUrlSearchParams(body)) return body.toString();
  if (!isPlainRecord(body)) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `${contentType} request body must be an object or URLSearchParams.`,
    );
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

function selectMultipartContentType(contentTypes: string, value: unknown): string {
  const choices = splitMediaRanges(contentTypes);
  if (choices.length === 1) {
    const declared = choices[0]!;
    if (isConcreteMediaType(declared)) return declared;
    // A range is a constraint, not a Content-Type that can be sent on the wire.
    // Parameterized ranges need explicit application selection to avoid losing parameters.
    if (
      !declared.includes(';') &&
      isBlob(value) &&
      /^[^/;\s*]+\/[^/;\s*]+$/.test(normalizeMediaType(value.type)) &&
      mediaRangeMatches(declared, value.type)
    )
      return value.type;
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Multipart media range ${declared} needs a matching concrete Blob/File type or an operation body extension.`,
    );
  }
  throw new OpenAPIChainError(
    'SERIALIZATION',
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
  contentType = selectMultipartContentType(contentType, value);
  if (contentType.includes(';')) {
    // Blob lowercases its entire type and discards non-ASCII values. Only use
    // native parts when that conversion preserves the parameter semantics.
    const nativeType = new Blob([], { type: contentType }).type;
    if (!nativeType || !mediaRangeMatches(contentType, nativeType))
      throw new OpenAPIChainError(
        'SERIALIZATION',
        'Native Blob cannot preserve multipart media parameters; use an operation body extension.',
      );
  }
  const normalized = normalizeMediaType(contentType);
  if (isBlob(value)) {
    const part = value.type === contentType ? value : new Blob([value], { type: contentType });
    if (isFile(value)) form.append(name, part, value.name);
    else form.append(name, part);
    return;
  }
  if (isArrayBuffer(value) || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))) {
    form.append(name, new Blob([value as BlobPart], { type: contentType }));
    return;
  }
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    validateTextCharset(contentType);
    form.append(
      name,
      new Blob([stringifyJson(value, `multipart field ${name} (${contentType})`)], {
        type: contentType,
      }),
    );
    return;
  }
  if (normalized.startsWith('text/')) {
    validateTextCharset(contentType);
    const text = primitive(value, `multipart field ${name}`);
    if (contentType.trim().toLowerCase() === 'text/plain') form.append(name, text);
    else form.append(name, new Blob([text], { type: contentType }));
    return;
  }

  throw new OpenAPIChainError(
    'SERIALIZATION',
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `deepObject multipart field ${name} requires explode=true.`,
    );
  }
  if ((style === 'spaceDelimited' || style === 'pipeDelimited') && explode) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `${style} multipart field ${name} requires explode=false.`,
    );
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `${contentType} request body must be an object or FormData.`,
    );
  }
  const media = findMediaMetadata(operation, contentType);
  const form = new FormData();

  for (const [name, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const encoding = media?.encoding?.[name];
    if (encoding?.hasHeaders) {
      throw new OpenAPIChainError(
        'SERIALIZATION',
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

function validateRequestContentType(
  contentType: string,
  operation: OperationMetadata | undefined,
  completeMetadata: boolean,
) {
  if (typeof contentType !== 'string' || !isConcreteMediaType(contentType)) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Request body content type ${contentType} is a media range; provide a concrete media type.`,
    );
  }
  if (completeMetadata && !requestBodyAcceptsMediaType(operation, contentType)) {
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Request body content type ${contentType} is not declared by the compiled OpenAPI operation.`,
    );
  }
}

export function serializeBody(
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
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
    throw new OpenAPIChainError(
      'SERIALIZATION',
      'Request body contentType is required without compiled single-concrete-media OpenAPI metadata.',
    );
  }
  validateRequestContentType(contentType, operation, completeMetadata);

  const normalized = normalizeMediaType(contentType);
  const media = findMediaMetadata(operation, contentType);
  if (customBody) {
    const serialized = customBody({ body, contentType, ...(operation ? { operation } : {}) });
    if (isFormData(serialized)) {
      if (normalized !== 'multipart/form-data' || contentType.includes(';'))
        throw new OpenAPIChainError(
          'SERIALIZATION',
          'FormData requires unparameterized multipart/form-data; use a body extension returning bytes or text to control media parameters.',
        );
      headers.delete('content-type');
    } else headers.set('content-type', contentType);
    return serialized;
  }
  if (isFormData(body) && normalized !== 'multipart/form-data')
    throw new OpenAPIChainError('SERIALIZATION', 'FormData requires multipart/form-data.');
  if (
    media?.requiresCustomSerializer &&
    (!media.customSerializerScope ||
      normalized.startsWith('multipart/') ||
      (media.customSerializerScope === 'form' &&
        normalized === 'application/x-www-form-urlencoded'))
  ) {
    throw new OpenAPIChainError('SERIALIZATION', media.requiresCustomSerializer);
  }
  if (normalized === 'multipart/form-data') {
    if (contentType.includes(';'))
      throw new OpenAPIChainError(
        'SERIALIZATION',
        'Native FormData cannot preserve multipart media parameters; use a body extension returning bytes or text.',
      );
    headers.delete('content-type');
    return serializeMultipartBody(body, operation, contentType);
  }
  if (normalized === 'application/x-www-form-urlencoded') {
    headers.set('content-type', contentType);
    return serializeUrlEncodedBody(body, operation, contentType);
  }
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    validateTextCharset(contentType);
    headers.set('content-type', contentType);
    return stringifyJson(body, `body (${contentType})`);
  }
  if (normalized.startsWith('text/')) {
    headers.set('content-type', contentType);
    if (isBlob(body) || isArrayBuffer(body) || ArrayBuffer.isView(body)) return body as BodyInit;
    validateTextCharset(contentType);
    if (typeof body === 'string') return body;
    if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
      return String(body);
    }
    throw new OpenAPIChainError(
      'SERIALIZATION',
      `Structured ${contentType} body requires an operation body extension.`,
    );
  }

  if (isNativeBody(body)) {
    if (typeof body === 'string' || isUrlSearchParams(body)) validateTextCharset(contentType);
    headers.set('content-type', contentType);
    return body;
  }
  throw new OpenAPIChainError(
    'SERIALIZATION',
    `Structured ${contentType} body requires an operation body extension.`,
  );
}
