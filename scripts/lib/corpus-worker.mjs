// Corpus worker: compiles metadata for each received document and sends every operation through
// core and strict clients with a capturing transport. Nothing is sent over the network.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const dist = process.argv[2];
const load = (entry) => import(pathToFileURL(`${dist}/${entry}.js`).href);
const [{ compileOpenAPIMetadata, OpenAPIChainError }, { createStrictClient }, { createClient }] =
  await Promise.all([load('metadata'), load('strict'), load('index')]);

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
// OpenAPI ignores these header parameters; callers supply them through contentType or init.
const IGNORED_HEADERS = new Set(['accept', 'content-type', 'authorization']);

function resolver(document) {
  return function resolve(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || typeof value.$ref !== 'string') return value;
    const ref = value.$ref;
    if (!ref.startsWith('#/') || seen.has(ref) || seen.size > 64) return undefined;
    seen.add(ref);
    let target = document;
    for (const raw of ref.slice(2).split('/')) {
      const token = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
      if (target == null || typeof target !== 'object' || !Object.hasOwn(target, token))
        return undefined;
      target = target[token];
    }
    return resolve(target, seen);
  };
}

/** Builds a plausible value for a schema: enum/const first, then required and a few optional fields. */
function sampler(resolve) {
  return function sample(input, depth = 0) {
    const schema = resolve(input);
    if (!schema || typeof schema !== 'object' || depth > 5) return 'x1';
    if (Array.isArray(schema.enum) && schema.enum.length)
      return schema.enum.find((value) => value !== null && value !== '') ?? schema.enum[0];
    if ('const' in schema) return schema.const;
    const types = Array.isArray(schema.type)
      ? schema.type.filter((type) => type !== 'null')
      : [schema.type];
    const type = types[0];
    if (!type && Array.isArray(schema.allOf)) {
      const parts = schema.allOf.map((part) => sample(part, depth + 1));
      return parts.every((part) => part && typeof part === 'object' && !Array.isArray(part))
        ? Object.assign({}, ...parts)
        : parts[0];
    }
    const branch = (schema.oneOf ?? schema.anyOf)?.[0];
    if (!type && branch && !schema.properties) return sample(branch, depth + 1);
    if (type === 'integer' || type === 'number') return 1;
    if (type === 'boolean') return true;
    if (type === 'array' || (!type && schema.items)) return [sample(schema.items, depth + 1)];
    if (type === 'object' || (!type && schema.properties)) {
      const value = {};
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      let optional = 0;
      for (const [name, property] of Object.entries(resolve(schema.properties) ?? {})) {
        if (!required.has(name) && optional++ >= 3) continue;
        if (!resolve(property)?.readOnly) value[name] = sample(property, depth + 1);
      }
      return value;
    }
    return 'x1';
  };
}

function binaryFields(schema, resolve, seen = new Set()) {
  const node = resolve(schema);
  const names = new Set();
  if (!node || typeof node !== 'object' || seen.has(node)) return names;
  seen.add(node);
  for (const [name, property] of Object.entries(resolve(node.properties) ?? {})) {
    const value = resolve(property);
    const untyped =
      value && !value.type && !value.properties && !value.items && !value.enum && !value.allOf;
    if (
      value &&
      (value.format === 'binary' || typeof value.contentEncoding === 'string' || untyped)
    )
      names.add(name);
  }
  for (const part of node.allOf ?? [])
    for (const name of binaryFields(part, resolve, seen)) names.add(name);
  return names;
}

const concreteMedia = (media) =>
  media === '*/*' || media.startsWith('application/*')
    ? 'application/json'
    : media.endsWith('/*')
      ? `${media.slice(0, -2)}/plain`
      : media;

function bodyFor(media, schema, sample, resolve) {
  const essence = media.split(';')[0].trim().toLowerCase();
  if (essence === 'application/json' || essence.endsWith('+json'))
    return schema ? sample(schema) : {};
  if (essence === 'multipart/form-data' || essence === 'application/x-www-form-urlencoded') {
    const value = schema ? sample(schema) : {};
    const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    // Binary parts are supplied as files, as an application would.
    if (essence === 'multipart/form-data')
      for (const name of binaryFields(schema, resolve))
        if (name in body) body[name] = new Blob(['x1'], { type: 'application/octet-stream' });
    return body;
  }
  return essence.startsWith('text/') ? 'x1' : new Uint8Array([1, 2, 3]);
}

/** Wire corruption markers: unrendered placeholders, object coercion or missing values. */
function corruption(template, url, body) {
  for (const [, name] of template.matchAll(/\{([^{}]+)\}/g))
    if (url.includes(`{${name}}`) || url.includes(`%7B${encodeURIComponent(name)}%7D`))
      return `unrendered {${name}}`;
  if (`${url} ${body}`.includes('[object Object]') || url.includes('%5Bobject%20Object%5D'))
    return '[object Object]';
  return /[=/&?](?:undefined|NaN)(?=$|[&/#])/.test(url) ? 'undefined or NaN value' : undefined;
}

function classify(error) {
  if (error instanceof OpenAPIChainError)
    return { kind: 'contract', code: error.code, message: error.message };
  const stack = String(error?.stack ?? '')
    .split('\n')
    .slice(1, 3)
    .join('\n');
  return {
    kind: /[\\/](?:packages[\\/]core|openapi-chain)[\\/]dist[\\/]/.test(stack)
      ? 'crash'
      : 'platform',
    code: error?.name ?? typeof error,
    message: String(error?.message ?? error),
    stack,
  };
}

async function smoke(document, metadata, resolve, sample) {
  const results = { counts: {}, records: [] };
  let sent = { url: '', body: '' };
  const transport = async ({ url, init }) => {
    sent = {
      url,
      body:
        typeof init.body === 'string'
          ? init.body
          : init.body instanceof URLSearchParams
            ? init.body.toString()
            : '',
    };
    return new Response(null, { status: 204 });
  };
  const baseUrl = 'https://corpus.test/api';
  const clients = [['core', createClient({ baseUrl, transport })]];
  if (metadata) clients.unshift(['strict', createStrictClient({ baseUrl, metadata, transport })]);
  for (const [template, rawItem] of Object.entries(document.paths ?? {})) {
    const item = resolve(rawItem) ?? {};
    for (const method of METHODS) {
      const operation = resolve(item[method]);
      if (!operation || typeof operation !== 'object') continue;
      const parameters = new Map();
      for (const raw of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        const parameter = resolve(raw);
        if (parameter?.name && parameter?.in) {
          const name = parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name;
          parameters.set(`${parameter.in}:${name}`, parameter);
        }
      }
      const full = {};
      const minimal = {};
      const pathParams = {};
      for (const parameter of parameters.values()) {
        const schema = parameter.schema ?? Object.values(parameter.content ?? {})[0]?.schema;
        const value = sample(schema);
        if (parameter.in === 'path') pathParams[parameter.name] = value === '' ? 'x1' : value;
        else if (parameter.in !== 'header' || !IGNORED_HEADERS.has(parameter.name.toLowerCase())) {
          (full[parameter.in] ??= {})[parameter.name] = value;
          if (parameter.required === true) (minimal[parameter.in] ??= {})[parameter.name] = value;
        }
      }
      // Template names without a declared parameter still need a value to render.
      for (const [, name] of template.matchAll(/\{([^{}]+)\}/g)) pathParams[name] ??= 'x1';
      const requestBody = resolve(operation.requestBody);
      const declared = Object.keys(requestBody?.content ?? {});
      if (
        declared.length &&
        (requestBody.required === true || ['post', 'put', 'patch'].includes(method))
      ) {
        const key =
          declared.find((media) => /^application\/json\s*(;|$)/i.test(media)) ??
          declared.find((media) => /\+json/i.test(media)) ??
          declared[0];
        const media = concreteMedia(key);
        const mediaObject = resolve(requestBody.content[key]) ?? {};
        for (const input of [full, minimal]) {
          input.contentType = media;
          input.body = bodyFor(media, mediaObject.schema, sample, resolve);
        }
      }
      for (const [client, api] of clients) {
        for (const [variant, input] of Object.entries({ minimal, full })) {
          sent = { url: '', body: '' };
          let outcome;
          try {
            await api.$path(template, pathParams)[method](input);
            const marker = corruption(template, sent.url, sent.body);
            outcome = marker
              ? {
                  kind: 'suspicious',
                  message: marker,
                  url: sent.url,
                  body: sent.body.slice(0, 200),
                }
              : { kind: 'sent' };
          } catch (error) {
            outcome = classify(error);
          }
          const key = `${client}:${variant}:${outcome.kind}`;
          results.counts[key] = (results.counts[key] ?? 0) + 1;
          if (outcome.kind !== 'sent')
            results.records.push({ client, variant, method, template, ...outcome });
        }
      }
    }
  }
  return results;
}

async function check(file) {
  const started = performance.now();
  const result = { file };
  let document;
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { ...result, parse: String(error) };
  }
  result.openapi = String(document.openapi ?? document.swagger ?? '');
  result.paths = Object.keys(document.paths ?? {}).length;
  const resolve = resolver(document);
  const sample = sampler(resolve);
  let metadata;
  const compileStarted = performance.now();
  try {
    metadata = compileOpenAPIMetadata(document);
    result.compile = { kind: 'ok' };
  } catch (error) {
    result.compile = classify(error);
    // The documented opt-in for nonconforming third-party template hierarchies.
    if (/same templated hierarchy/.test(result.compile.message)) {
      try {
        metadata = compileOpenAPIMetadata(document, { onAmbiguousTemplate: 'allow' });
        result.compileAllow = { kind: 'ok' };
      } catch (retry) {
        result.compileAllow = classify(retry);
      }
    }
  }
  result.compile.ms = performance.now() - compileStarted;
  try {
    result.smoke = await smoke(document, metadata, resolve, sample);
  } catch (error) {
    result.smokeError = classify(error);
  }
  result.ms = performance.now() - started;
  return result;
}

process.on('message', (file) => {
  void check(file).then((result) => process.send(result));
});
process.send({ ready: true });
