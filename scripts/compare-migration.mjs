import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createClient, httpMethods, HttpError } from '../dist/index.js';
import { createStrictClient } from '../dist/strict.js';
import { compileOpenAPIMetadata } from '../dist/metadata.js';

// Deliberately compare observable values rather than multipart boundary strings.
async function snapshot(value) {
  if (value === undefined) return { kind: 'undefined' };
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { kind: 'bytes', type: value.constructor.name, bytes: [...bytes] };
  }
  if (value instanceof Blob) {
    return {
      kind: 'blob',
      type: value.type,
      ...(value instanceof File ? { name: value.name } : {}),
      bytes: [...new Uint8Array(await value.arrayBuffer())],
    };
  }
  if (value instanceof URLSearchParams) return { kind: 'search-params', value: value.toString() };
  if (value instanceof FormData) {
    return {
      kind: 'form',
      entries: await Promise.all(
        [...value].map(async ([name, item]) => [name, await snapshot(item)]),
      ),
    };
  }
  if (value instanceof Headers) return { kind: 'headers', entries: [...value] };
  if (value instanceof Response)
    return { kind: 'response', status: value.status, headers: [...value.headers] };
  if (Array.isArray(value)) return Promise.all(value.map(snapshot));
  if (
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return {
      kind: 'object',
      value: Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, item]) => [key, await snapshot(item)]),
        ),
      ),
    };
  }
  throw new TypeError(
    'Migration snapshots require JSON-like values, Fetch body values or bytes; streams and other objects need an explicit test.',
  );
}

async function errorSnapshot(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: String(error instanceof Error ? error.message : error),
    ...(error instanceof HttpError
      ? { status: error.status, data: await snapshot(error.data) }
      : {}),
  };
}

async function runScenario(config, scenario, metadata, metadataError, strict) {
  const requests = [];
  if (strict && metadataError) return { requests, error: metadataError };
  try {
    const transport = async ({ url, method, init }) => {
      const { headers, body, ...rest } = init;
      requests.push({
        url,
        method,
        headers: [...new Headers(headers)],
        body: await snapshot(body),
        init: await snapshot(rest),
      });
      const response = await scenario.response();
      if (!(response instanceof Response) || response.bodyUsed)
        throw new TypeError('response() must return a fresh Response for each run.');
      return response;
    };
    const options = {
      baseUrl: config.baseUrl ?? 'https://migration.invalid',
      headers: config.headers,
      throwOnError: config.throwOnError,
      transport,
    };
    const client = strict ? createStrictClient({ ...options, metadata }) : createClient(options);
    const input = await (strict && scenario.strictInput
      ? scenario.strictInput()
      : scenario.input?.());
    const params = await scenario.params?.();
    const value = await client.$path(scenario.path, params)[scenario.method ?? 'get'](input);
    return { requests, result: await snapshot(value) };
  } catch (error) {
    return { requests, error: await errorSnapshot(error) };
  }
}

/** Offline scenario comparison, not static proof of schema compatibility. */
export async function compareMigration(config) {
  if (!config || !Array.isArray(config.scenarios) || !config.scenarios.length)
    throw new TypeError('Provide at least one migration scenario.');
  const names = new Set();
  for (const scenario of config.scenarios) {
    if (
      !scenario ||
      typeof scenario.name !== 'string' ||
      !scenario.name ||
      names.has(scenario.name) ||
      typeof scenario.path !== 'string' ||
      !scenario.path.startsWith('/') ||
      !httpMethods.includes(scenario.method ?? 'get') ||
      typeof scenario.response !== 'function'
    )
      throw new TypeError(
        'Scenarios require unique names, exact paths, supported methods and response() factories.',
      );
    for (const key of ['input', 'strictInput', 'params']) {
      if (scenario[key] !== undefined && typeof scenario[key] !== 'function')
        throw new TypeError(
          `${scenario.name}: ${key} must be a factory so each client gets fresh values.`,
        );
    }
    names.add(scenario.name);
  }
  let metadata;
  let metadataError;
  try {
    metadata = compileOpenAPIMetadata(config.document, {
      paths: config.scenarios.map(({ path }) => path),
      ...(config.onAmbiguousTemplate === undefined
        ? {}
        : { onAmbiguousTemplate: config.onAmbiguousTemplate }),
    });
  } catch (error) {
    metadataError = await errorSnapshot(error);
  }
  const scenarios = [];
  for (const scenario of config.scenarios) {
    const core = await runScenario(config, scenario, metadata, metadataError, false);
    const strict = await runScenario(config, scenario, metadata, metadataError, true);
    const differences = [];
    if (!isDeepStrictEqual(core.requests, strict.requests)) differences.push('request');
    if (!isDeepStrictEqual(core.result, strict.result)) differences.push('response');
    if (!isDeepStrictEqual(core.error, strict.error)) differences.push('error');
    const passed = differences.length === 0 && !core.error && !strict.error;
    scenarios.push({
      name: scenario.name,
      adaptedInput: Boolean(scenario.strictInput),
      passed,
      differences,
      core,
      strict,
    });
  }
  return {
    passed: scenarios.every(({ passed }) => passed),
    scope:
      'Only the supplied inputs, mocked responses and exact-path calls were compared; this is not proof of API compatibility.',
    ...(metadataError ? { metadataError } : {}),
    scenarios,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const fixture = process.argv[2];
    if (!fixture || process.argv.length !== 3)
      throw new TypeError(
        'Usage: pnpm migration:check ./migration.config.mjs (trusted local module; build first)',
      );
    // Module factories preserve typed arrays, FormData and operation extensions.
    const config = (await import(pathToFileURL(resolve(fixture)).href)).default;
    const report = await compareMigration(config);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ passed: false, error: await errorSnapshot(error) }, null, 2));
    process.exitCode = 1;
  }
}
