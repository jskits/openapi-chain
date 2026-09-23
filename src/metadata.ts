import { httpMethods } from './constant.js';
import type {
  CompiledOpenAPIMetadata,
  EncodingMetadata,
  HttpMethod,
  MediaTypeMetadata,
  OpenAPIMetadata,
  OperationMetadata,
  ParameterLocation,
  ParameterMetadata,
  ParameterStyle,
  RequestBodyMetadata,
} from './type.js';

type AnyRecord = Record<string, unknown>;
type Analysis = 'kind' | 'content' | 'properties' | 'encoding' | 'ambiguous';
type CachedAnalysis = { value: unknown; height: number };
type CompilationContext = {
  document: AnyRecord;
  version: OasMinor;
  work: number;
  caches: Record<Analysis, Map<unknown, CachedAnalysis>>;
  stack: { height: number }[];
};

function spendWork(root: CompilationContext): void {
  if (++root.work > 1_000_000) throw new TypeError('OpenAPI compilation work budget exceeded.');
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
type OasMinor = '3.0' | '3.1' | '3.2';

const BASE_STYLES: Record<Exclude<ParameterLocation, 'querystring'>, readonly ParameterStyle[]> = {
  path: ['simple', 'label', 'matrix'],
  query: ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'],
  header: ['simple'],
  cookie: ['form'],
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, context: string): AnyRecord {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  return value;
}

function openapiMinor(root: AnyRecord): OasMinor {
  if (typeof root.openapi !== 'string') {
    throw new TypeError('OpenAPI document.openapi must be a version string.');
  }
  const match = /^3\.(0|1|2)(?:\.|$)/.exec(root.openapi);
  if (!match) {
    throw new TypeError(
      `compileOpenAPIMetadata() supports OpenAPI 3.0, 3.1, and 3.2; received ${root.openapi}.`,
    );
  }
  return `3.${match[1]!}` as OasMinor;
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(root: CompilationContext, ref: string): unknown {
  if (!ref.startsWith('#')) {
    throw new TypeError(
      `External OpenAPI $ref is not supported by compileOpenAPIMetadata(): ${ref}. ` +
        'Bundle or dereference the document first.',
    );
  }
  let pointer: string;
  try {
    // URI fragments are decoded before JSON Pointer tokenization/unescaping.
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    throw new TypeError(`Invalid URI encoding in OpenAPI $ref: ${ref}`);
  }
  if (pointer === '') return root.document;
  if (!pointer.startsWith('/')) {
    throw new TypeError(`Unsupported local OpenAPI $ref (expected JSON Pointer): ${ref}`);
  }
  if (/~(?:[^01]|$)/.test(pointer)) {
    throw new TypeError(`Invalid JSON Pointer escape in OpenAPI $ref: ${ref}`);
  }
  let value: unknown = root.document;
  for (const token of pointer.slice(1).split('/').map(decodePointerToken)) {
    if (Array.isArray(value) && !/^(?:0|[1-9][0-9]*)$/.test(token)) {
      throw new TypeError(`Invalid JSON Pointer array index in OpenAPI $ref: ${ref}`);
    }
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, token)) {
      throw new TypeError(`Unresolvable OpenAPI $ref: ${ref}`);
    }
    value = (value as AnyRecord)[token];
  }
  return value;
}

function dereference(
  value: unknown,
  root: CompilationContext,
  context: 'reference' | 'schema' | 'path' = 'reference',
  seen = new Set<string>(),
): unknown {
  spendWork(root);
  if (!isRecord(value) || typeof value.$ref !== 'string') return value;
  const ref = value.$ref;
  if (seen.has(ref)) throw new TypeError(`Circular OpenAPI $ref: ${ref}`);
  if (seen.size >= 128) throw new TypeError('OpenAPI reference depth exceeds 128.');
  seen.add(ref);
  const target = dereference(resolvePointer(root, ref), root, context, seen);
  seen.delete(ref);
  // Reference Object siblings never override serialization fields. OAS 3.0
  // also uses Reference Objects in schema positions; 3.1+ has schema applicators.
  if (context === 'reference' || (context === 'schema' && root.version === '3.0')) return target;
  const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref'));
  if (!Object.keys(siblings).length) return target;
  if (context === 'schema') return { allOf: [target, siblings] };
  if (!isRecord(target)) return target;
  const overlap = Object.keys(siblings).find((key) => Object.hasOwn(target, key));
  if (overlap !== undefined) {
    throw new TypeError(`Ambiguous Path Item $ref sibling field: ${overlap}.`);
  }
  return { ...target, ...siblings };
}

function parameterKey(location: string, name: string): string {
  return `${location}:${location === 'header' ? name.toLowerCase() : name}`;
}

function defaultStyle(location: Exclude<ParameterLocation, 'querystring'>): ParameterStyle {
  return location === 'query' || location === 'cookie' ? 'form' : 'simple';
}

function allowedStyles(
  location: Exclude<ParameterLocation, 'querystring'>,
  version: OasMinor,
): readonly ParameterStyle[] {
  if (location === 'cookie' && version === '3.2') return ['form', 'cookie'];
  return BASE_STYLES[location];
}

class SchemaInferenceError extends TypeError {}

// Track traversal across schema applicators, not only adjacent $ref chains.
function visitSchema<T>(
  value: unknown,
  active: Set<unknown>,
  root: CompilationContext,
  analysis: Analysis,
  visit: () => T,
): T {
  spendWork(root);
  const key = isRecord(value) && typeof value.$ref === 'string' ? value.$ref : value;
  // Reference spelling identifies reusable results, not the node being visited.
  // Distinct schema objects may legally apply the same reference in siblings.
  if (active.has(value))
    throw new SchemaInferenceError(
      'Recursive OpenAPI schema serialization metadata cannot be inferred.',
    );
  const cacheKey = isRecord(value) && Object.keys(value).length === 1 ? key : value;
  const cached = root.caches[analysis].get(cacheKey);
  if (active.size + (cached?.height ?? 1) > 128)
    throw new SchemaInferenceError('OpenAPI schema serialization depth exceeds 128.');
  const parent = root.stack.at(-1);
  if (cached) {
    if (parent) parent.height = Math.max(parent.height, cached.height + 1);
    return cached.value as T;
  }
  const frame = { height: 1 };
  root.stack.push(frame);
  active.add(value);
  try {
    const result = visit();
    root.caches[analysis].set(cacheKey, { value: result, height: frame.height });
    if (parent) parent.height = Math.max(parent.height, frame.height + 1);
    return result;
  } finally {
    active.delete(value);
    root.stack.pop();
  }
}

// JSON Schema type arrays describe alternatives, never a preferred first type.
function schemaType(schema: AnyRecord): unknown {
  if (!Array.isArray(schema.type)) return schema.type;
  const types = new Set(schema.type.filter((item) => item !== 'null'));
  return types.size === 1 ? types.values().next().value : undefined;
}

function hasAmbiguousType(
  schemaValue: unknown,
  root: CompilationContext,
  active = new Set<unknown>(),
): boolean {
  return visitSchema(schemaValue, active, root, 'ambiguous', () => {
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return false;
    if (
      Array.isArray(schema.type) &&
      new Set(schema.type.filter((item) => item !== 'null')).size > 1
    )
      return true;
    const children = [
      ...(Array.isArray(schema.allOf) ? schema.allOf : []),
      ...('items' in schema ? [schema.items] : []),
    ];
    return children.some((child) => hasAmbiguousType(child, root, active));
  });
}

function schemaKind(
  schemaValue: unknown,
  root: CompilationContext,
  version: OasMinor,
  active = new Set<unknown>(),
): 'primitive' | 'object' | 'array' | 'binary' | 'unknown' {
  return visitSchema(schemaValue, active, root, 'kind', () => {
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return 'unknown';
    if (Array.isArray(schema.allOf)) {
      const kinds = schema.allOf.map((item) => schemaKind(item, root, version, active));
      if (kinds.includes('object')) return 'object';
      if (kinds.includes('array')) return 'array';
      if (kinds.includes('binary')) return 'binary';
      if (kinds.includes('primitive')) return 'primitive';
    }
    const type = schemaType(schema);
    if (type === 'object' || isRecord(schema.properties)) return 'object';
    if (type === 'array' || 'items' in schema) return 'array';
    if (
      type === 'string' &&
      ((version === '3.0' && schema.format === 'binary') ||
        (version !== '3.0' && typeof schema.contentEncoding === 'string'))
    ) {
      return 'binary';
    }
    if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
      return 'primitive';
    }
    return 'unknown';
  });
}

function defaultContentTypeForSchema(
  schemaValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): string {
  return inferContentType(schemaValue, root, version) ?? 'application/octet-stream';
}

function inferContentType(
  schemaValue: unknown,
  root: CompilationContext,
  version: OasMinor,
  active = new Set<unknown>(),
): string | undefined {
  return visitSchema(schemaValue, active, root, 'content', () => {
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return undefined;
    const type = schemaType(schema);
    // An explicit type determines the default; applicators do not imply object.
    if (type === 'array' || 'items' in schema) {
      return inferContentType(schema.items, root, version, active);
    }
    if (type === 'object' || isRecord(schema.properties)) return 'application/json';
    if (type === 'string') {
      const binary =
        (version === '3.0' && schema.format === 'binary') ||
        (version !== '3.0' && typeof schema.contentEncoding === 'string');
      return binary ? 'application/octet-stream' : 'text/plain';
    }
    if (type === 'number' || type === 'integer' || type === 'boolean') return 'text/plain';
    if (Array.isArray(schema.allOf)) {
      const types = new Set(
        schema.allOf
          .map((item) => inferContentType(item, root, version, active))
          .filter((value) => value !== undefined),
      );
      if (types.size > 1) {
        throw new TypeError(
          'Conflicting allOf serialization content types; provide an explicit schema type.',
        );
      }
      return types.values().next().value;
    }
    return undefined;
  });
}

function collectPropertySchemas(
  schemaValue: unknown,
  root: CompilationContext,
  active = new Set<unknown>(),
): Record<string, unknown> {
  return visitSchema(schemaValue, active, root, 'properties', () => {
    const target: Record<string, unknown> = dictionary();
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return target;
    if (isRecord(schema.properties)) {
      for (const [name, property] of Object.entries(schema.properties)) target[name] = property;
    }
    if (Array.isArray(schema.allOf)) {
      for (const item of schema.allOf) {
        for (const [name, property] of Object.entries(collectPropertySchemas(item, root, active))) {
          spendWork(root);
          // allOf is conjunction, not a last-write-wins object merge.
          target[name] =
            Object.hasOwn(target, name) && target[name] !== property
              ? { allOf: [target[name], property] }
              : property;
        }
      }
    }
    return target;
  });
}

function schemaUsesContentEncoding(
  schemaValue: unknown,
  root: CompilationContext,
  active = new Set<unknown>(),
): boolean {
  return visitSchema(schemaValue, active, root, 'encoding', () => {
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return false;
    if (typeof schema.contentEncoding === 'string') return true;
    if (Array.isArray(schema.allOf)) {
      return schema.allOf.some((item) => schemaUsesContentEncoding(item, root, active));
    }
    if ((schema.type === 'array' || 'items' in schema) && schema.items !== undefined) {
      return schemaUsesContentEncoding(schema.items, root, active);
    }
    return false;
  });
}

function propertyMetadataForSchema(
  schemaValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): {
  kinds?: Record<string, ReturnType<typeof schemaKind>>;
  contentTypes?: Record<string, string>;
  schemas: Record<string, unknown>;
} {
  const schemas = collectPropertySchemas(schemaValue, root);
  if (!Object.keys(schemas).length) return { schemas };
  const kinds: Record<string, ReturnType<typeof schemaKind>> = dictionary();
  const contentTypes: Record<string, string> = dictionary();
  for (const [name, propertySchema] of Object.entries(schemas)) {
    kinds[name] = schemaKind(propertySchema, root, version);
    contentTypes[name] = defaultContentTypeForSchema(propertySchema, root, version);
  }
  return { kinds, contentTypes, schemas };
}

function compileEncoding(
  raw: unknown,
  version: OasMinor,
): { encoding?: Record<string, EncodingMetadata>; requiresCustomSerializer?: string } {
  if (raw === undefined) return {};
  const record = asRecord(raw, 'OpenAPI encoding');
  const result: Record<string, EncodingMetadata> = dictionary();
  let customReason: string | undefined;

  for (const [name, value] of Object.entries(record)) {
    const encoding = asRecord(value, `encoding for ${name}`);
    const metadata: EncodingMetadata = {
      styleBased: 'style' in encoding || 'explode' in encoding || 'allowReserved' in encoding,
    };

    if ('contentType' in encoding && typeof encoding.contentType !== 'string') {
      throw new TypeError(`encoding.contentType for ${name} must be a string.`);
    }
    if (typeof encoding.contentType === 'string') {
      metadata.contentType = encoding.contentType;
      if (
        encoding.contentType
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean).length > 1
      ) {
        customReason =
          `Encoding ${name} declares multiple contentType choices (${encoding.contentType}). ` +
          'OpenAPI requires the application to choose the intended media type; provide an operation body extension.';
        metadata.requiresCustomSerializer = customReason;
      }
    }

    if ('style' in encoding && typeof encoding.style !== 'string') {
      throw new TypeError(`encoding.style for ${name} must be a string.`);
    }
    if (typeof encoding.style === 'string') {
      const style = encoding.style as ParameterStyle;
      if (!['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'].includes(style)) {
        throw new TypeError(`Unsupported encoding style ${encoding.style} for ${name}.`);
      }
      metadata.style = style;
    }

    if ('explode' in encoding && typeof encoding.explode !== 'boolean') {
      throw new TypeError(`encoding.explode for ${name} must be boolean.`);
    }
    if (typeof encoding.explode === 'boolean') metadata.explode = encoding.explode;

    if ('allowReserved' in encoding && typeof encoding.allowReserved !== 'boolean') {
      throw new TypeError(`encoding.allowReserved for ${name} must be boolean.`);
    }
    if (typeof encoding.allowReserved === 'boolean')
      metadata.allowReserved = encoding.allowReserved;

    const effectiveStyle = metadata.style ?? 'form';
    const effectiveExplode = metadata.explode ?? effectiveStyle === 'form';
    if (effectiveStyle === 'deepObject' && effectiveExplode === false) {
      throw new TypeError(`deepObject encoding ${name} requires explode=true.`);
    }
    if (
      (effectiveStyle === 'spaceDelimited' || effectiveStyle === 'pipeDelimited') &&
      effectiveExplode
    ) {
      throw new TypeError(`${effectiveStyle} encoding ${name} requires explode=false.`);
    }

    if (isRecord(encoding.headers) && Object.keys(encoding.headers).length)
      metadata.hasHeaders = true;

    if (version === '3.2') {
      for (const advanced of ['prefixEncoding', 'itemEncoding', 'encoding'] as const) {
        if (advanced in encoding) {
          customReason =
            `OAS 3.2 ${advanced} on encoding ${name} requires ordered/nested part control ` +
            'that native FormData cannot represent.';
          metadata.requiresCustomSerializer = customReason;
        }
      }
    }
    result[name] = metadata;
  }

  return {
    ...(Object.keys(result).length ? { encoding: result } : {}),
    ...(customReason ? { requiresCustomSerializer: customReason } : {}),
  };
}

function normalizeMediaTypeForCompiler(contentType: string): string {
  return contentType.split(';', 1)[0]!.trim().toLowerCase();
}

function compileMediaType(
  rawMedia: unknown,
  root: CompilationContext,
  version: OasMinor,
  contentType: string,
): MediaTypeMetadata | undefined {
  const mediaObject = isRecord(rawMedia) ? rawMedia : {};
  const normalizedContentType = normalizeMediaTypeForCompiler(contentType);
  const multipart = normalizedContentType.startsWith('multipart/');
  const maySerializeForm =
    multipart ||
    normalizedContentType === 'application/x-www-form-urlencoded' ||
    normalizedContentType === '*/*' ||
    normalizedContentType === 'application/*';
  // JSON and other opaque bodies never need field-level form inference.
  if (!maySerializeForm) return undefined;
  const compiledEncoding = compileEncoding(mediaObject.encoding, version);
  let properties: ReturnType<typeof propertyMetadataForSchema>;
  let formReason: string | undefined;
  try {
    const schemas = collectPropertySchemas(mediaObject.schema, root);
    const ambiguous =
      hasAmbiguousType(mediaObject.schema, root) ||
      Object.values(schemas).some((schema) => hasAmbiguousType(schema, root));
    properties = ambiguous
      ? { schemas }
      : propertyMetadataForSchema(mediaObject.schema, root, version);
    if (ambiguous)
      formReason =
        'Multiple non-null schema types cannot determine form serialization; provide an operation body extension.';
  } catch (error) {
    // Wildcards can select JSON at runtime. Preserve that valid path while
    // keeping unsupported form inference fail-closed. Invalid refs still fail.
    if (!(error instanceof SchemaInferenceError) || !normalizedContentType.includes('*'))
      throw error;
    properties = { schemas: {} };
    formReason = `${error.message} Provide an operation body extension for form serialization.`;
  }
  let customReason = multipart ? compiledEncoding.requiresCustomSerializer : undefined;

  if (version === '3.2') {
    for (const advanced of ['prefixEncoding', 'itemEncoding'] as const) {
      if (advanced in mediaObject) {
        customReason =
          `OAS 3.2 ${advanced} for ${contentType} requires positional multipart/form control; ` +
          'provide an operation body extension or a custom transport.';
      }
    }
  }

  if (
    multipart &&
    compiledEncoding.encoding &&
    Object.values(compiledEncoding.encoding).some((item) => item.hasHeaders)
  ) {
    customReason =
      `Multipart encoding.headers for ${contentType} require per-part header control; ` +
      'provide an operation body extension or a custom transport.';
  }

  if (multipart) {
    const encodedProperty = Object.entries(properties.schemas).find(([, schema]) =>
      schemaUsesContentEncoding(schema, root),
    );
    if (encodedProperty) {
      customReason =
        `Multipart property ${encodedProperty[0]} uses schema contentEncoding. OpenAPI maps this ` +
        'to per-part Content-Transfer-Encoding semantics, which native FormData cannot set; ' +
        'provide an operation body extension or a custom transport.';
    }
  }

  if (compiledEncoding.encoding && Object.keys(properties.schemas).length) {
    for (const name of Object.keys(compiledEncoding.encoding)) {
      if (!Object.hasOwn(properties.schemas, name)) {
        throw new TypeError(`Encoding key ${name} is not a request-body schema property.`);
      }
    }
  }

  if (
    !compiledEncoding.encoding &&
    !properties.kinds &&
    !properties.contentTypes &&
    !customReason &&
    !formReason
  ) {
    return undefined;
  }

  return {
    ...(compiledEncoding.encoding ? { encoding: compiledEncoding.encoding } : {}),
    ...(properties.kinds ? { propertyKinds: properties.kinds } : {}),
    ...(properties.contentTypes ? { propertyContentTypes: properties.contentTypes } : {}),
    ...(customReason
      ? { requiresCustomSerializer: customReason }
      : formReason
        ? { requiresCustomSerializer: formReason, customSerializerScope: 'form' as const }
        : {}),
  };
}

function compileParameter(
  rawValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): ParameterMetadata {
  const value = asRecord(dereference(rawValue, root), 'OpenAPI parameter');
  const name = value.name;
  const location = value.in;
  if (typeof name !== 'string' || !name) {
    throw new TypeError('OpenAPI parameter.name must be a non-empty string.');
  }
  if (!['path', 'query', 'querystring', 'header', 'cookie'].includes(String(location))) {
    throw new TypeError(`Unsupported OpenAPI parameter location for ${name}.`);
  }
  if (location === 'querystring' && version !== '3.2') {
    throw new TypeError(`in: querystring requires OpenAPI 3.2 (${name}).`);
  }

  const hasSchema = 'schema' in value;
  const hasContent = 'content' in value;
  if (hasSchema === hasContent) {
    throw new TypeError(`Parameter ${name} must define exactly one of schema or content.`);
  }

  let contentType: string | undefined;
  let media: MediaTypeMetadata | undefined;
  if (hasContent) {
    const contentRecord = asRecord(value.content, `content for parameter ${name}`);
    const mediaTypes = Object.keys(contentRecord);
    if (mediaTypes.length !== 1) {
      throw new TypeError(`Parameter ${name} content must contain exactly one media type.`);
    }
    contentType = mediaTypes[0]!;
    media = compileMediaType(contentRecord[contentType], root, version, contentType);
  }

  if (location === 'querystring') {
    if (!contentType) throw new TypeError(`querystring parameter ${name} requires content.`);
    for (const keyword of ['style', 'explode', 'allowReserved'] as const) {
      if (keyword in value) {
        throw new TypeError(`querystring parameter ${name} cannot use ${keyword}.`);
      }
    }
    return {
      name,
      in: 'querystring',
      style: 'form',
      explode: true,
      ...(value.required === true ? { required: true } : {}),
      contentType,
      ...(media ? { media } : {}),
    };
  }

  const typedLocation = location as Exclude<ParameterLocation, 'querystring'>;
  if (hasContent && ('style' in value || 'explode' in value || 'allowReserved' in value)) {
    throw new TypeError(
      `Parameter ${name} uses content; style, explode, and allowReserved are not applicable.`,
    );
  }

  const style = (value.style ?? defaultStyle(typedLocation)) as ParameterStyle;
  if (!allowedStyles(typedLocation, version).includes(style)) {
    throw new TypeError(
      `Invalid OpenAPI style ${String(style)} for ${typedLocation} parameter ${name}.`,
    );
  }
  if (typedLocation === 'path' && value.required !== true) {
    throw new TypeError(`Path parameter ${name} must set required: true.`);
  }
  if ('explode' in value && typeof value.explode !== 'boolean') {
    throw new TypeError(`Parameter ${name} explode must be boolean.`);
  }
  if ('allowReserved' in value && typeof value.allowReserved !== 'boolean') {
    throw new TypeError(`Parameter ${name} allowReserved must be boolean.`);
  }

  if (value.allowReserved === true) {
    const allowed =
      typedLocation === 'query' ||
      (version === '3.2' && typedLocation === 'path') ||
      (version === '3.2' && typedLocation === 'cookie' && style === 'form');
    if (!allowed) {
      throw new TypeError(`allowReserved is not valid for ${typedLocation} parameter ${name}.`);
    }
  }

  const explode = typeof value.explode === 'boolean' ? value.explode : style === 'form';
  if (style === 'deepObject' && explode === false) {
    throw new TypeError(`deepObject parameter ${name} requires explode=true.`);
  }
  if ((style === 'spaceDelimited' || style === 'pipeDelimited') && explode) {
    throw new TypeError(`${style} parameter ${name} requires explode=false.`);
  }
  if (version === '3.2' && typedLocation === 'cookie' && explode === false) {
    throw new TypeError(`OAS 3.2 cookie parameter ${name} requires explode=true.`);
  }

  return {
    name,
    in: typedLocation,
    style,
    explode,
    ...(value.required === true ? { required: true } : {}),
    ...(value.allowReserved === true ? { allowReserved: true } : {}),
    ...(contentType ? { contentType } : {}),
    ...(media ? { media } : {}),
  };
}

function compileParameterList(
  raw: unknown,
  root: CompilationContext,
  version: OasMinor,
): Map<string, ParameterMetadata> {
  const result = new Map<string, ParameterMetadata>();
  if (raw === undefined) return result;
  if (!Array.isArray(raw)) throw new TypeError('OpenAPI parameters must be an array.');
  for (const item of raw) {
    const resolved = asRecord(dereference(item, root), 'OpenAPI parameter');
    const resolvedName = resolved.name;
    const resolvedLocation = resolved.in;
    if (
      resolvedLocation === 'header' &&
      typeof resolvedName === 'string' &&
      ['accept', 'content-type', 'authorization'].includes(resolvedName.toLowerCase())
    ) {
      // OAS requires these header Parameter Object definitions to be ignored.
      continue;
    }
    const parameter = compileParameter(resolved, root, version);
    const key = parameterKey(parameter.in, parameter.name);
    if (result.has(key)) {
      throw new TypeError(`Duplicate OpenAPI parameter ${parameter.name} in ${parameter.in}.`);
    }
    result.set(key, parameter);
  }
  return result;
}

function compileRequestBody(
  rawValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): RequestBodyMetadata | undefined {
  if (rawValue === undefined) return undefined;
  const value = asRecord(dereference(rawValue, root), 'OpenAPI requestBody');
  if (value.content === undefined) {
    return {
      mediaTypes: [],
      ...(value.required === true ? { required: true } : {}),
    };
  }
  const content = asRecord(value.content, 'OpenAPI requestBody.content');
  const mediaTypes = Object.keys(content);
  const media: Record<string, MediaTypeMetadata> = dictionary();
  for (const [contentType, rawMedia] of Object.entries(content)) {
    const compiled = compileMediaType(rawMedia, root, version, contentType);
    if (compiled) media[contentType] = compiled;
  }
  return {
    mediaTypes,
    ...(value.required === true ? { required: true } : {}),
    ...(Object.keys(media).length ? { media } : {}),
  };
}

function compileOperation(
  path: string,
  pathItem: AnyRecord,
  operationValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): OperationMetadata {
  const operation = asRecord(dereference(operationValue, root), 'OpenAPI operation');
  const parameters = compileParameterList(pathItem.parameters, root, version);
  for (const [key, value] of compileParameterList(operation.parameters, root, version)) {
    parameters.set(key, value);
  }

  const byLocation: OperationMetadata['parameters'] = {};
  for (const parameter of parameters.values()) {
    const location = parameter.in;
    const current = (byLocation[location] ?? dictionary<ParameterMetadata>()) as Record<
      string,
      ParameterMetadata
    >;
    current[parameter.name] = parameter;
    byLocation[location] = current;
  }

  if (byLocation.querystring && Object.keys(byLocation.querystring).length > 1) {
    throw new TypeError(`Operation ${path} can define at most one querystring parameter.`);
  }
  if (byLocation.querystring && byLocation.query && Object.keys(byLocation.query).length) {
    throw new TypeError(`Operation ${path} cannot mix query and querystring parameters.`);
  }

  const templateNames = [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
  const pathParameters = byLocation.path ?? {};
  for (const name of templateNames) {
    if (!Object.hasOwn(pathParameters, name)) {
      throw new TypeError(`Path ${path} is missing parameter definition for {${name}}.`);
    }
  }
  for (const name of Object.keys(pathParameters)) {
    if (!templateNames.includes(name)) {
      throw new TypeError(`Path parameter ${name} is not present in template ${path}.`);
    }
  }

  const requestBody = compileRequestBody(operation.requestBody, root, version);
  return {
    ...(Object.keys(byLocation).length ? { parameters: byLocation } : {}),
    ...(requestBody ? { requestBody } : {}),
  };
}

function normalizedTemplate(path: string): string {
  return path.replace(/\{[^{}]+\}/g, '{}');
}

/**
 * Compile the runtime-only OpenAPI information that TypeScript erases.
 *
 * This intentionally does not generate operation functions. External refs must
 * be bundled/dereferenced first; unsupported positional/nested multipart
 * features fail closed or are marked for an operation body extension.
 */
export type CompileOpenAPIMetadataOptions = {
  /** Allow nonconforming duplicate template hierarchies; ambiguous chain calls still fail. */
  onAmbiguousTemplate?: 'throw' | 'allow';
  /** Compile only these exact paths while resolving references against the full document. */
  paths?: readonly string[];
};

export function compileOpenAPIMetadata(
  document: unknown,
  options: CompileOpenAPIMetadataOptions = {},
): CompiledOpenAPIMetadata {
  if (
    options.onAmbiguousTemplate !== undefined &&
    options.onAmbiguousTemplate !== 'throw' &&
    options.onAmbiguousTemplate !== 'allow'
  )
    throw new TypeError('Invalid onAmbiguousTemplate option.');
  const source = asRecord(document, 'OpenAPI document');
  const version = openapiMinor(source);
  const root: CompilationContext = {
    document: source,
    version,
    work: 0,
    stack: [],
    caches: {
      kind: new Map(),
      content: new Map(),
      properties: new Map(),
      encoding: new Map(),
      ambiguous: new Map(),
    },
  };
  const paths = asRecord(source.paths ?? {}, 'OpenAPI paths');
  const operations: Record<string, Partial<Record<HttpMethod, OperationMetadata>>> = dictionary();
  const seenTemplates = new Map<string, string>();
  let selected: Set<string> | undefined;
  if (options.paths !== undefined) {
    if (!Array.isArray(options.paths)) throw new TypeError('Metadata paths must be an array.');
    selected = new Set(options.paths);
    for (const path of selected) {
      if (typeof path !== 'string' || !path.startsWith('/') || !Object.hasOwn(paths, path))
        throw new TypeError(`Unknown selected OpenAPI path: ${String(path)}`);
    }
  }

  for (const [path, rawPathItem] of Object.entries(paths)) {
    if (path.startsWith('x-') || (selected && !selected.has(path))) continue;
    if (!path.startsWith('/')) {
      throw new TypeError(`OpenAPI path must begin with /: ${path}`);
    }
    const normalized = normalizedTemplate(path);
    const prior = seenTemplates.get(normalized);
    if (prior && prior !== path && options.onAmbiguousTemplate !== 'allow') {
      throw new TypeError(
        `OpenAPI paths ${prior} and ${path} have the same templated hierarchy; matching would be ambiguous. Use { onAmbiguousTemplate: 'allow' } only for documents that cannot be corrected.`,
      );
    }
    seenTemplates.set(normalized, path);

    const pathItem = asRecord(dereference(rawPathItem, root, 'path'), `Path item ${path}`);
    if (
      version === '3.2' &&
      isRecord(pathItem.additionalOperations) &&
      Object.keys(pathItem.additionalOperations).length
    ) {
      throw new TypeError(
        `Path ${path} uses OAS 3.2 additionalOperations. Arbitrary HTTP methods are not representable ` +
          'by the typed chain yet; use a custom transport or remove/bundle those operations.',
      );
    }

    const methods: Partial<Record<HttpMethod, OperationMetadata>> = {};
    for (const method of httpMethods) {
      const rawOperation = pathItem[method];
      if (rawOperation === undefined || rawOperation === null) continue;
      methods[method] = compileOperation(path, pathItem, rawOperation, root, version);
    }
    if (Object.keys(methods).length) operations[path] = methods;
  }

  return { version: 1, complete: true, operations } as CompiledOpenAPIMetadata;
}

/** Create an explicitly partial metadata table for advanced/manual use. */
export function defineOpenAPIMetadata(metadata: OpenAPIMetadata): OpenAPIMetadata {
  return metadata;
}

export type {
  CompiledOpenAPIMetadata,
  EncodingMetadata,
  MediaTypeMetadata,
  OpenAPIMetadata,
  OperationMetadata,
  ParameterLocation,
  ParameterMetadata,
  ParameterStyle,
  RequestBodyMetadata,
} from './type.js';
