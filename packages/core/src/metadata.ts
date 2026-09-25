export { OpenAPIChainError, type OpenAPIChainErrorCode } from './errors.js';
import { OpenAPIChainError, operationError } from './errors.js';
import { parseMediaRange, splitMediaRanges } from './media-range.js';
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
type Analysis = 'facts';
type CachedAnalysis = { value: unknown; height: number };
type CompilationContext = {
  document: AnyRecord;
  version: OasMinor;
  work: number;
  caches: Record<Analysis, Map<unknown, CachedAnalysis>>;
  stack: { height: number }[];
};

function spendWork(root: CompilationContext): void {
  if (++root.work > 1_000_000)
    throw new OpenAPIChainError('METADATA_COMPILE', 'OpenAPI compilation work budget exceeded.');
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
  if (!isRecord(value))
    throw new OpenAPIChainError('METADATA_COMPILE', `${context} must be an object.`);
  return value;
}

function openapiMinor(root: AnyRecord): OasMinor {
  if (typeof root.openapi !== 'string') {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      'OpenAPI document.openapi must be a version string.',
    );
  }
  const match = /^3\.(0|1|2)\.(?:0|[1-9]\d*)$/.exec(root.openapi);
  if (!match) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
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
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `External OpenAPI $ref is not supported by compileOpenAPIMetadata(): ${ref}. ` +
        'Bundle or dereference the document first.',
    );
  }
  let pointer: string;
  try {
    // URI fragments are decoded before JSON Pointer tokenization/unescaping.
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    throw new OpenAPIChainError('METADATA_COMPILE', `Invalid URI encoding in OpenAPI $ref: ${ref}`);
  }
  if (pointer === '') return root.document;
  if (!pointer.startsWith('/')) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Unsupported local OpenAPI $ref (expected JSON Pointer): ${ref}`,
    );
  }
  if (/~(?:[^01]|$)/.test(pointer)) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Invalid JSON Pointer escape in OpenAPI $ref: ${ref}`,
    );
  }
  let value: unknown = root.document;
  for (const token of pointer.slice(1).split('/').map(decodePointerToken)) {
    if (Array.isArray(value) && !/^(?:0|[1-9][0-9]*)$/.test(token)) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Invalid JSON Pointer array index in OpenAPI $ref: ${ref}`,
      );
    }
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, token)) {
      throw new OpenAPIChainError('METADATA_COMPILE', `Unresolvable OpenAPI $ref: ${ref}`);
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
  if (seen.has(ref))
    throw new OpenAPIChainError('METADATA_COMPILE', `Circular OpenAPI $ref: ${ref}`);
  if (seen.size >= 128)
    throw new OpenAPIChainError('METADATA_COMPILE', 'OpenAPI reference depth exceeds 128.');
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
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Ambiguous Path Item $ref sibling field: ${overlap}.`,
    );
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

class SchemaInferenceError extends OpenAPIChainError {
  constructor(message: string) {
    super('METADATA_COMPILE', message);
  }
}

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

type SchemaKind = 'primitive' | 'object' | 'array' | 'binary' | 'unknown';

/**
 * Serialization-relevant facts of one schema, with `$ref` and `allOf` already applied as
 * conjunction. This is the only place that walks schema applicators; every serialization
 * decision below is derived from these facts, so equivalent spellings cannot diverge.
 */
type SchemaFacts = {
  /** Single non-null `type` values declared by any conjunct. */
  types: ReadonlySet<unknown>;
  /** A conjunct (or an item schema) declares several non-null types. */
  ambiguous: boolean;
  hasProperties: boolean;
  hasItems: boolean;
  /** Conjunction of every property declaration, in declaration order. */
  properties: Record<string, unknown>;
  /** Conjunction of every `items` schema. */
  items?: SchemaFacts;
  contentEncoding: boolean;
  formatBinary: boolean;
};

const EMPTY_FACTS: SchemaFacts = Object.freeze({
  types: new Set(),
  ambiguous: false,
  hasProperties: false,
  hasItems: false,
  properties: Object.freeze(dictionary()),
  contentEncoding: false,
  formatBinary: false,
});

function mergeFacts(
  target: SchemaFacts,
  source: SchemaFacts,
  root: CompilationContext,
): SchemaFacts {
  const properties = Object.assign(dictionary<unknown>(), target.properties);
  for (const [name, property] of Object.entries(source.properties)) {
    spendWork(root);
    properties[name] =
      Object.hasOwn(properties, name) && properties[name] !== property
        ? { allOf: [properties[name], property] }
        : property;
  }
  const items =
    target.items && source.items
      ? mergeFacts(target.items, source.items, root)
      : (target.items ?? source.items);
  return {
    types: new Set([...target.types, ...source.types]),
    ambiguous: target.ambiguous || source.ambiguous,
    hasProperties: target.hasProperties || source.hasProperties,
    hasItems: target.hasItems || source.hasItems,
    properties,
    ...(items ? { items } : {}),
    contentEncoding: target.contentEncoding || source.contentEncoding,
    formatBinary: target.formatBinary || source.formatBinary,
  };
}

function schemaFacts(
  schemaValue: unknown,
  root: CompilationContext,
  active = new Set<unknown>(),
): SchemaFacts {
  return visitSchema(schemaValue, active, root, 'facts', () => {
    const schema = dereference(schemaValue, root, 'schema');
    if (!isRecord(schema)) return EMPTY_FACTS;
    const type = schemaType(schema);
    let facts: SchemaFacts = {
      types: new Set(type === undefined ? [] : [type]),
      ambiguous:
        Array.isArray(schema.type) &&
        new Set(schema.type.filter((item) => item !== 'null')).size > 1,
      hasProperties: isRecord(schema.properties),
      hasItems: 'items' in schema,
      properties: dictionary(),
      contentEncoding: typeof schema.contentEncoding === 'string',
      formatBinary: schema.format === 'binary',
    };
    if (isRecord(schema.properties)) {
      for (const [name, property] of Object.entries(schema.properties)) {
        facts.properties[name] = property;
      }
    }
    if (schema.items !== undefined) {
      facts = mergeFacts(
        facts,
        { ...EMPTY_FACTS, items: schemaFacts(schema.items, root, active) },
        root,
      );
    }
    if (Array.isArray(schema.allOf)) {
      for (const branch of schema.allOf) {
        facts = mergeFacts(facts, schemaFacts(branch, root, active), root);
      }
    }
    if (facts.items?.ambiguous) facts.ambiguous = true;
    return facts;
  });
}

// JSON Schema type arrays describe alternatives, never a preferred first type.
function schemaType(schema: AnyRecord): unknown {
  if (!Array.isArray(schema.type)) return schema.type;
  const types = new Set(schema.type.filter((item) => item !== 'null'));
  return types.size === 1 ? types.values().next().value : undefined;
}

// Explicit types determine the shape; items/properties only hint when no type is declared,
// and applicators alone never imply an object.
function schemaShape(facts: SchemaFacts, label: string): Exclude<SchemaKind, 'binary'> {
  const shapes = new Set<Exclude<SchemaKind, 'binary' | 'unknown'>>();
  for (const type of facts.types) {
    if (type === 'object' || type === 'array') shapes.add(type);
    else if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean')
      shapes.add('primitive');
  }
  if (shapes.size > 1) {
    throw new SchemaInferenceError(
      `${label} declares conflicting schema types (${[...facts.types].join(', ')}) across its ` +
        'schema and allOf branches; make them agree or preprocess the document.',
    );
  }
  const [shape] = shapes;
  if (shape) return shape;
  if (facts.hasItems) return 'array';
  if (facts.hasProperties) return 'object';
  return 'unknown';
}

function isBinary(facts: SchemaFacts, version: OasMinor): boolean {
  return (
    facts.types.has('string') && (version === '3.0' ? facts.formatBinary : facts.contentEncoding)
  );
}

function schemaKind(facts: SchemaFacts, version: OasMinor, label: string): SchemaKind {
  const shape = schemaShape(facts, label);
  return shape === 'primitive' && isBinary(facts, version) ? 'binary' : shape;
}

/** Default media for one encoded value (Encoding Object default table). */
function valueContentType(
  facts: SchemaFacts,
  version: OasMinor,
  label: string,
): string | undefined {
  switch (schemaKind(facts, version, label)) {
    case 'array':
      // OAS 3.2 lists arrays as JSON; earlier versions default from the inner type.
      if (version === '3.2') return 'application/json';
      return facts.items && valueContentType(facts.items, version, `${label} items`);
    case 'object':
      return 'application/json';
    case 'binary':
      return 'application/octet-stream';
    case 'primitive':
      return 'text/plain';
    default:
      return undefined;
  }
}

function usesContentEncoding(facts: SchemaFacts): boolean {
  return facts.contentEncoding || (facts.items !== undefined && usesContentEncoding(facts.items));
}

type PropertyPlan = {
  kind: SchemaKind;
  /** Default media applied to each encoded value of the property. */
  contentType: string;
  /** Multipart would need per-part Content-Transfer-Encoding for this property. */
  contentEncoding: boolean;
};

function planProperty(name: string, facts: SchemaFacts, version: OasMinor): PropertyPlan {
  const label = `Property ${name}`;
  const kind = schemaKind(facts, version, label);
  // OAS 3.2 Encoding By Name applies the default to each item of an array property.
  const split = version === '3.2' && kind === 'array';
  const encoded = split ? facts.items : facts;
  return {
    kind,
    contentType:
      (encoded && valueContentType(encoded, version, split ? `${label} items` : label)) ??
      'application/octet-stream',
    contentEncoding: usesContentEncoding(facts),
  };
}

/**
 * Names a body may carry, including oneOf/anyOf alternatives: an Encoding key only has to
 * name a schema property. Serialization plans stay conjunctive (allOf) as documented.
 */
function declaredPropertyNames(
  schemaValue: unknown,
  root: CompilationContext,
  names = new Set<string>(),
  seen = new Set<unknown>(),
): Set<string> {
  spendWork(root);
  const schema = dereference(schemaValue, root, 'schema');
  if (!isRecord(schema) || seen.has(schema)) return names;
  seen.add(schema);
  if (isRecord(schema.properties))
    for (const name of Object.keys(schema.properties)) names.add(name);
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const branches = schema[key];
    if (Array.isArray(branches))
      for (const branch of branches) declaredPropertyNames(branch, root, names, seen);
  }
  return names;
}

type BodyPlan = {
  schemas: Record<string, unknown>;
  /** Absent when a type ambiguity prevents choosing a form representation. */
  properties?: Record<string, PropertyPlan>;
};

function planBody(schemaValue: unknown, root: CompilationContext, version: OasMinor): BodyPlan {
  const body = schemaFacts(schemaValue, root);
  const schemas = body.properties;
  const facts = Object.entries(schemas).map(
    ([name, schema]) => [name, schemaFacts(schema, root)] as const,
  );
  if (body.ambiguous || facts.some(([, item]) => item.ambiguous)) return { schemas };
  const properties: Record<string, PropertyPlan> = dictionary();
  for (const [name, item] of facts) properties[name] = planProperty(name, item, version);
  return { schemas, properties };
}

function pluckPlan<K extends keyof PropertyPlan>(
  planned: [string, PropertyPlan][],
  key: K,
): Record<string, PropertyPlan[K]> {
  const result: Record<string, PropertyPlan[K]> = dictionary();
  for (const [name, plan] of planned) result[name] = plan[key];
  return result;
}

function compileEncoding(
  raw: unknown,
  version: OasMinor,
  defaults: Record<string, string> | undefined,
): {
  encoding?: Record<string, EncodingMetadata>;
  requiresCustomSerializer?: string;
  requiresCustomFormSerializer?: string;
} {
  if (raw === undefined) return {};
  const record = asRecord(raw, 'OpenAPI encoding');
  const result: Record<string, EncodingMetadata> = dictionary();
  let customReason: string | undefined;
  let nestedReason: string | undefined;

  for (const [name, value] of Object.entries(record)) {
    const encoding = asRecord(value, `encoding for ${name}`);
    const metadata: EncodingMetadata = {
      styleBased: 'style' in encoding || 'explode' in encoding || 'allowReserved' in encoding,
    };

    if (
      !metadata.styleBased &&
      'contentType' in encoding &&
      typeof encoding.contentType !== 'string'
    ) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `encoding.contentType for ${name} must be a string.`,
      );
    }
    if (!metadata.styleBased && typeof encoding.contentType === 'string') {
      metadata.contentType = encoding.contentType;
      let choices: string[];
      try {
        choices = splitMediaRanges(encoding.contentType);
      } catch (cause) {
        throw new OpenAPIChainError(
          'METADATA_COMPILE',
          `Invalid encoding.contentType for ${name}: ${encoding.contentType}`,
          { cause },
        );
      }
      if (choices.length > 1) {
        customReason =
          `Encoding ${name} declares multiple contentType choices (${encoding.contentType}). ` +
          'OpenAPI requires the application to choose the intended media type; provide an operation body extension.';
        metadata.requiresCustomSerializer = customReason;
      }
    }

    if ('style' in encoding && typeof encoding.style !== 'string') {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `encoding.style for ${name} must be a string.`,
      );
    }
    if (typeof encoding.style === 'string') {
      const style = encoding.style as ParameterStyle;
      if (!['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'].includes(style)) {
        throw new OpenAPIChainError(
          'METADATA_COMPILE',
          `Unsupported encoding style ${encoding.style} for ${name}.`,
        );
      }
      metadata.style = style;
    }

    if ('explode' in encoding && typeof encoding.explode !== 'boolean') {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `encoding.explode for ${name} must be boolean.`,
      );
    }
    // explode has no effect on deepObject (explicit in OAS 3.2), so equivalent spellings match.
    if (typeof encoding.explode === 'boolean' && metadata.style !== 'deepObject')
      metadata.explode = encoding.explode;

    if ('allowReserved' in encoding && typeof encoding.allowReserved !== 'boolean') {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `encoding.allowReserved for ${name} must be boolean.`,
      );
    }
    if (typeof encoding.allowReserved === 'boolean')
      metadata.allowReserved = encoding.allowReserved;

    const effectiveStyle = metadata.style ?? 'form';
    const effectiveExplode = metadata.explode ?? effectiveStyle === 'form';
    if (
      (effectiveStyle === 'spaceDelimited' || effectiveStyle === 'pipeDelimited') &&
      effectiveExplode
    ) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `${effectiveStyle} encoding ${name} requires explode=false.`,
      );
    }

    if ('headers' in encoding) asRecord(encoding.headers, `encoding.headers for ${name}`);
    // Encoding Object headers ignore Content-Type; contentType describes it instead.
    if (
      isRecord(encoding.headers) &&
      Object.keys(encoding.headers).some((header) => header.toLowerCase() !== 'content-type')
    )
      metadata.hasHeaders = true;

    if (version === '3.2' && !metadata.styleBased) {
      const nestedMedia = normalizeMediaTypeForCompiler(
        metadata.contentType ?? defaults?.[name] ?? 'application/octet-stream',
      );
      const nestedMultipart = nestedMedia.startsWith('multipart/');
      for (const advanced of ['prefixEncoding', 'itemEncoding', 'encoding'] as const) {
        if (
          advanced in encoding &&
          (nestedMultipart ||
            (advanced === 'encoding' && nestedMedia === 'application/x-www-form-urlencoded'))
        ) {
          customReason =
            `OAS 3.2 ${advanced} on encoding ${name} requires ordered/nested part control ` +
            'that native FormData cannot represent.';
          metadata.requiresCustomSerializer = customReason;
          nestedReason = customReason;
        }
      }
    }
    result[name] = metadata;
  }

  return {
    ...(Object.keys(result).length ? { encoding: result } : {}),
    ...(customReason ? { requiresCustomSerializer: customReason } : {}),
    ...(nestedReason ? { requiresCustomFormSerializer: nestedReason } : {}),
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
  try {
    parseMediaRange(contentType);
  } catch (cause) {
    throw new OpenAPIChainError('METADATA_COMPILE', `Invalid media declaration: ${contentType}`, {
      cause,
    });
  }
  const mediaObject = asRecord(dereference(rawMedia, root), `Media Type Object for ${contentType}`);
  const normalizedContentType = normalizeMediaTypeForCompiler(contentType);
  const multipart = normalizedContentType.startsWith('multipart/');
  const maySerializeForm =
    multipart ||
    normalizedContentType === 'application/x-www-form-urlencoded' ||
    normalizedContentType === '*/*' ||
    normalizedContentType === 'application/*';
  // JSON and other opaque bodies never need field-level form inference.
  if (!maySerializeForm) return undefined;
  let plan: BodyPlan;
  let formReason: string | undefined;
  try {
    plan = planBody(mediaObject.schema, root, version);
    if (!plan.properties)
      formReason =
        'Multiple non-null schema types cannot determine form serialization; provide an operation body extension.';
  } catch (error) {
    // Wildcards can select JSON at runtime. Preserve that valid path while
    // keeping unsupported form inference fail-closed. Invalid refs still fail.
    if (!(error instanceof SchemaInferenceError) || !normalizedContentType.includes('*'))
      throw error;
    plan = { schemas: {} };
    formReason = `${error.message} Provide an operation body extension for form serialization.`;
  }
  const planned = Object.entries(plan.properties ?? {});
  const kinds = planned.length ? pluckPlan(planned, 'kind') : undefined;
  const contentTypes = planned.length ? pluckPlan(planned, 'contentType') : undefined;
  const compiledEncoding = compileEncoding(mediaObject.encoding, version, contentTypes);
  formReason ??= compiledEncoding.requiresCustomFormSerializer;
  const maySerializeMultipart = multipart || normalizedContentType === '*/*';
  let customReason = maySerializeMultipart ? compiledEncoding.requiresCustomSerializer : undefined;

  if (version === '3.2' && maySerializeMultipart) {
    for (const advanced of ['prefixEncoding', 'itemEncoding'] as const) {
      if (advanced in mediaObject) {
        customReason =
          `OAS 3.2 ${advanced} for ${contentType} requires positional multipart/form control; ` +
          'provide an operation body extension or a custom transport.';
      }
    }
  }

  if (
    maySerializeMultipart &&
    compiledEncoding.encoding &&
    Object.values(compiledEncoding.encoding).some((item) => item.hasHeaders)
  ) {
    customReason =
      `Multipart encoding.headers for ${contentType} require per-part header control; ` +
      'provide an operation body extension or a custom transport.';
  }

  if (maySerializeMultipart) {
    const encodedProperty = planned.find(([, property]) => property.contentEncoding);
    if (encodedProperty) {
      customReason =
        `Multipart property ${encodedProperty[0]} uses schema contentEncoding. OpenAPI maps this ` +
        'to per-part Content-Transfer-Encoding semantics, which native FormData cannot set; ' +
        'provide an operation body extension or a custom transport.';
    }
  }

  const declaredNames = compiledEncoding.encoding
    ? declaredPropertyNames(mediaObject.schema, root)
    : new Set<string>();
  if (compiledEncoding.encoding && declaredNames.size) {
    for (const name of Object.keys(compiledEncoding.encoding)) {
      if (!declaredNames.has(name)) {
        throw new OpenAPIChainError(
          'METADATA_COMPILE',
          `Encoding key ${name} is not a request-body schema property.`,
        );
      }
    }
  }

  if (!compiledEncoding.encoding && !kinds && !contentTypes && !customReason && !formReason) {
    return undefined;
  }

  return {
    ...(compiledEncoding.encoding ? { encoding: compiledEncoding.encoding } : {}),
    ...(kinds ? { propertyKinds: kinds } : {}),
    ...(contentTypes ? { propertyContentTypes: contentTypes } : {}),
    ...(formReason
      ? { requiresCustomSerializer: formReason, customSerializerScope: 'form' as const }
      : customReason
        ? { requiresCustomSerializer: customReason, customSerializerScope: 'multipart' as const }
        : {}),
  };
}

function compileParameter(
  rawValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): ParameterMetadata {
  const value = asRecord(dereference(rawValue, root), 'OpenAPI parameter');
  if ('required' in value && typeof value.required !== 'boolean')
    throw new OpenAPIChainError('METADATA_COMPILE', 'OpenAPI parameter.required must be boolean.');
  const name = value.name;
  const location = value.in;
  if (typeof name !== 'string' || !name) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      'OpenAPI parameter.name must be a non-empty string.',
    );
  }
  if (!['path', 'query', 'querystring', 'header', 'cookie'].includes(String(location))) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Unsupported OpenAPI parameter location for ${name}.`,
    );
  }
  if (location === 'querystring' && version !== '3.2') {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `in: querystring requires OpenAPI 3.2 (${name}).`,
    );
  }

  const hasSchema = 'schema' in value;
  const hasContent = 'content' in value;
  if (hasSchema === hasContent) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Parameter ${name} must define exactly one of schema or content.`,
    );
  }

  let contentType: string | undefined;
  let media: MediaTypeMetadata | undefined;
  if (hasContent) {
    const contentRecord = asRecord(value.content, `content for parameter ${name}`);
    const mediaTypes = Object.keys(contentRecord);
    if (mediaTypes.length !== 1) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Parameter ${name} content must contain exactly one media type.`,
      );
    }
    contentType = mediaTypes[0]!;
    media = compileMediaType(contentRecord[contentType], root, version, contentType);
  }

  if (location === 'querystring') {
    if (!contentType)
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `querystring parameter ${name} requires content.`,
      );
    for (const keyword of ['style', 'explode', 'allowReserved'] as const) {
      if (keyword in value) {
        throw new OpenAPIChainError(
          'METADATA_COMPILE',
          `querystring parameter ${name} cannot use ${keyword}.`,
        );
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
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Parameter ${name} uses content; style, explode, and allowReserved are not applicable.`,
    );
  }

  const style = (value.style ?? defaultStyle(typedLocation)) as ParameterStyle;
  if (!allowedStyles(typedLocation, version).includes(style)) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Invalid OpenAPI style ${String(style)} for ${typedLocation} parameter ${name}.`,
    );
  }
  if (typedLocation === 'path' && value.required !== true) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Path parameter ${name} must set required: true.`,
    );
  }
  if ('explode' in value && typeof value.explode !== 'boolean') {
    throw new OpenAPIChainError('METADATA_COMPILE', `Parameter ${name} explode must be boolean.`);
  }
  if ('allowReserved' in value && typeof value.allowReserved !== 'boolean') {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Parameter ${name} allowReserved must be boolean.`,
    );
  }

  if (value.allowReserved === true) {
    const allowed =
      typedLocation === 'query' ||
      (version === '3.2' && typedLocation === 'path') ||
      (version === '3.2' && typedLocation === 'cookie' && style === 'form');
    if (!allowed) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `allowReserved is not valid for ${typedLocation} parameter ${name}.`,
      );
    }
  }

  // explode has no effect on deepObject (explicit in OAS 3.2; its default is false), so the
  // only defined representation is recorded instead of rejecting the default spelling.
  const explode =
    style === 'deepObject' ||
    (typeof value.explode === 'boolean' ? value.explode : style === 'form' || style === 'cookie');
  if ((style === 'spaceDelimited' || style === 'pipeDelimited') && explode) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `${style} parameter ${name} requires explode=false.`,
    );
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
  if (!Array.isArray(raw))
    throw new OpenAPIChainError('METADATA_COMPILE', 'OpenAPI parameters must be an array.');
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
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Duplicate OpenAPI parameter ${parameter.name} in ${parameter.in}.`,
      );
    }
    result.set(key, parameter);
  }
  return result;
}

/** Prefix compile errors with where they occurred; the original stays the cause. */
function locate<T>(location: string, compile: () => T): T {
  try {
    return compile();
  } catch (error) {
    if (!(error instanceof OpenAPIChainError) || error.code !== 'METADATA_COMPILE') throw error;
    throw new OpenAPIChainError('METADATA_COMPILE', `${location}: ${error.message}`, {
      cause: error,
    });
  }
}

function compileRequestBody(
  rawValue: unknown,
  root: CompilationContext,
  version: OasMinor,
): RequestBodyMetadata | undefined {
  if (rawValue === undefined) return undefined;
  const value = asRecord(dereference(rawValue, root), 'OpenAPI requestBody');
  if ('required' in value && typeof value.required !== 'boolean')
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      'OpenAPI requestBody.required must be boolean.',
    );
  const content = asRecord(value.content, 'OpenAPI requestBody.content');
  const mediaTypes = Object.keys(content);
  const media: Record<string, MediaTypeMetadata> = dictionary();
  for (const [contentType, rawMedia] of Object.entries(content)) {
    const compiled = locate(`${contentType} request body`, () =>
      compileMediaType(rawMedia, root, version, contentType),
    );
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
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Operation ${path} can define at most one querystring parameter.`,
    );
  }
  if (byLocation.querystring && byLocation.query && Object.keys(byLocation.query).length) {
    throw new OpenAPIChainError(
      'METADATA_COMPILE',
      `Operation ${path} cannot mix query and querystring parameters.`,
    );
  }

  const templateNames = [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
  const pathParameters = byLocation.path ?? {};
  for (const name of templateNames) {
    if (!Object.hasOwn(pathParameters, name)) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Path ${path} is missing parameter definition for {${name}}.`,
      );
    }
  }
  for (const name of Object.keys(pathParameters)) {
    if (!templateNames.includes(name)) {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Path parameter ${name} is not present in template ${path}.`,
      );
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
    throw new OpenAPIChainError('METADATA_COMPILE', 'Invalid onAmbiguousTemplate option.');
  const source = asRecord(document, 'OpenAPI document');
  const version = openapiMinor(source);
  const root: CompilationContext = {
    document: source,
    version,
    work: 0,
    stack: [],
    caches: {
      facts: new Map(),
    },
  };
  const paths = asRecord(source.paths ?? {}, 'OpenAPI paths');
  const operations: Record<string, Partial<Record<HttpMethod, OperationMetadata>>> = dictionary();
  const seenTemplates = new Map<string, string>();
  let selected: Set<string> | undefined;
  if (options.paths !== undefined) {
    if (!Array.isArray(options.paths))
      throw new OpenAPIChainError('METADATA_COMPILE', 'Metadata paths must be an array.');
    selected = new Set(options.paths);
    for (const path of selected) {
      if (typeof path !== 'string' || !path.startsWith('/') || !Object.hasOwn(paths, path))
        throw new OpenAPIChainError(
          'METADATA_COMPILE',
          `Unknown selected OpenAPI path: ${String(path)}`,
        );
    }
  }

  for (const [path, rawPathItem] of Object.entries(paths)) {
    if (path.startsWith('x-') || (selected && !selected.has(path))) continue;
    if (!path.startsWith('/')) {
      throw new OpenAPIChainError('METADATA_COMPILE', `OpenAPI path must begin with /: ${path}`);
    }
    const normalized = normalizedTemplate(path);
    const prior = seenTemplates.get(normalized);
    if (prior && prior !== path && options.onAmbiguousTemplate !== 'allow') {
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
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
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `Path ${path} uses OAS 3.2 additionalOperations. Arbitrary HTTP methods are not representable ` +
          'by the typed chain yet; use a custom transport or remove/bundle those operations.',
      );
    }

    if (version !== '3.2' && 'query' in pathItem)
      throw new OpenAPIChainError(
        'METADATA_COMPILE',
        `QUERY operation at ${path} requires OpenAPI 3.2.`,
      );

    const methods: Partial<Record<HttpMethod, OperationMetadata>> = {};
    for (const method of httpMethods) {
      const rawOperation = pathItem[method];
      if (rawOperation === undefined || rawOperation === null) continue;
      try {
        methods[method] = locate(`${method.toUpperCase()} ${path}`, () =>
          compileOperation(path, pathItem, rawOperation, root, version),
        );
      } catch (error) {
        throw operationError(error, method, path);
      }
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
