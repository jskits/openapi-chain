// Type-check real, pinned OpenAPI documents through openapi-chain and openapi-fetch.
//   node scripts/benchmark-real-schemas.mjs --compiler=ts6|ts7 [--operations=40] [--schemas=github,stripe]
// Documents are downloaded once into .cache/real-schemas and verified by SHA-256. Both clients use
// the same openapi-typescript output, operations, response assertions and compiler options.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import { compiler, compilerInfo } from './lib/compiler.mjs';

const option = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const root = fileURLToPath(new URL('..', import.meta.url));
const cache = join(root, '.cache/real-schemas');
const operationCount = Number(option('operations', 40));
const schemas = {
  github: {
    url: 'https://raw.githubusercontent.com/github/rest-api-description/2f44eacae7f376f1ed158829fbe008cc4eae5815/descriptions/api.github.com/api.github.com.json',
    sha256: '3789c57a9296668a9d5101e2b8310233f2e0c6b6a3fba4519ca804b26f457e0c',
  },
  stripe: {
    url: 'https://raw.githubusercontent.com/stripe/openapi/db67eb25e0ca80f12ffffb8f04dc1ba8289cd10f/openapi/spec3.json',
    sha256: '8b5c2f03d4cd67f51b719b48963b9d47927296fc17eecb49005fc7228f1c077d',
  },
};
const selected = option('schemas', Object.keys(schemas).join(',')).split(',');
const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
// Core reserves method names, `then` and `$path` as chain segments; those routes need `$path()`.
const reserved = new Set([...methods, 'then', '$path']);
const identifier = /^[A-Za-z_$][\w$]*$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function prepare(name) {
  const { url, sha256: expected } = schemas[name];
  const file = join(cache, `${name}.json`);
  if (!existsSync(file) || sha256(readFileSync(file)) !== expected) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    assert.ok(response.ok, `Cannot download ${url}: ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  assert.equal(sha256(readFileSync(file)), expected, `${name} document changed`);
  const types = join(cache, `${name}.d.ts`);
  const stamp = join(cache, `${name}.d.ts.sha256`);
  if (!existsSync(types) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== expected) {
    const cli = join(root, 'node_modules/openapi-typescript/bin/cli.js');
    const result = spawn.sync(process.execPath, [cli, file, '-o', types], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(stamp, expected);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolve(document, value) {
  if (!value?.$ref) return value;
  const pointer = value.$ref.replace(/^#\//, '').split('/');
  return resolve(
    document,
    pointer.reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], document),
  );
}

/** GET operations a fluent chain can express with path arguments only and one JSON 200 result. */
function eligibleOperations(document) {
  const operations = [];
  for (const [path, item] of Object.entries(document.paths)) {
    const operation = item.get;
    if (!operation || path.endsWith('/') || path.includes('//')) continue;
    const segments = path.slice(1).split('/');
    const dynamic = (segment) => /^\{[^{}]+\}$/.test(segment);
    if (segments.some((s) => !dynamic(s) && (/[{}]/.test(s) || reserved.has(s)))) continue;
    const parameters = new Map();
    for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
      const resolved = resolve(document, parameter);
      parameters.set(`${resolved.in}:${resolved.name}`, resolved);
    }
    if ([...parameters.values()].some((p) => p.in !== 'path' && p.required)) continue;
    const values = {};
    for (const segment of segments.filter(dynamic)) {
      const parameter = parameters.get(`path:${segment.slice(1, -1)}`);
      const schema = resolve(document, parameter?.schema);
      const type = schema?.type;
      if (schema?.enum) values[segment] = JSON.stringify(schema.enum[0]).replaceAll('"', "'");
      else if (type === 'string') values[segment] = "'x'";
      else if (type === 'integer' || type === 'number') values[segment] = '1';
    }
    if (Object.keys(values).length !== segments.filter(dynamic).length) continue;
    const success = Object.keys(operation.responses ?? {}).filter((code) => code.startsWith('2'));
    const content = resolve(document, operation.responses?.['200'])?.content;
    const media = Object.keys(content ?? {});
    if (success.length !== 1 || success[0] !== '200' || media.join() !== 'application/json')
      continue;
    if (operation.requestBody && resolve(document, operation.requestBody).required) continue;
    operations.push({ path, segments, values });
  }
  return operations.toSorted((a, b) => a.path.localeCompare(b.path));
}

function sample(operations) {
  if (operations.length <= operationCount) return operations;
  return Array.from(
    { length: operationCount },
    (_, i) => operations[Math.floor((i * operations.length) / operationCount)],
  );
}

function consumer(name, client, used, scoped) {
  const chainImport = JSON.stringify(join(root, 'packages/core/dist/index.js'));
  const fetchImport = JSON.stringify(fileURLToPath(import.meta.resolve('openapi-fetch')));
  const keys = used.map(({ path }) => JSON.stringify(path)).join(' | ');
  const lines = [
    `import type { paths as AllPaths } from './${name}.js';`,
    client === 'openapi-chain'
      ? `import { createClient } from ${chainImport};`
      : `import createClient from ${fetchImport};`,
    `type Paths = ${scoped ? `Pick<AllPaths, ${keys}>` : 'AllPaths'};`,
    `type Ok<P extends keyof Paths> = Paths[P] extends { get: { responses: { 200: { content: { 'application/json': infer T } } } } } ? T : never;`,
    // openapi-chain types an undeclared 2xx through `default`, so its success data includes it.
    `type Default<P extends keyof Paths> = Paths[P] extends { get: { responses: { default: { content: { 'application/json': infer T } } } } } ? T : never;`,
    "const api = createClient<Paths>({ baseUrl: 'https://api.example.test' });",
  ];
  used.forEach(({ path, segments, values }, i) => {
    const key = JSON.stringify(path);
    if (client === 'openapi-chain') {
      const chain = segments
        .map((s) => values[s] ?? (identifier.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`))
        .map((s) => (s in values || /^'|^\d/.test(s) ? `(${s})` : s))
        .join('');
      lines.push(
        `const r${i}: Promise<Ok<${key}> | Default<${key}>> = api${chain}.get(); void r${i};`,
      );
    } else {
      const params = Object.entries(values)
        .map(([segment, value]) => `${JSON.stringify(segment.slice(1, -1))}: ${value}`)
        .join(', ');
      const input = params ? `, { params: { path: { ${params} } } }` : '';
      lines.push(
        `const r${i}: Promise<Ok<${key}> | undefined> = api.GET(${key}${input}).then((result) => result.data); void r${i};`,
      );
    }
  });
  // Negative checks keep the comparison honest: both clients must still reject bad path input.
  const typed = used.find(({ values }) => Object.values(values).includes("'x'"));
  if (typed) {
    const key = JSON.stringify(typed.path);
    if (client === 'openapi-chain') {
      const first = typed.segments.findIndex((s) => typed.values[s] === "'x'");
      const prefix = typed.segments
        .slice(0, first)
        .map((s) =>
          s in typed.values
            ? `(${typed.values[s]})`
            : identifier.test(s)
              ? `.${s}`
              : `[${JSON.stringify(s)}]`,
        )
        .join('');
      lines.push(
        '// @ts-expect-error a string path parameter rejects an object',
        `api${prefix}({});`,
      );
    } else {
      lines.push(
        '// @ts-expect-error required path parameters cannot be omitted',
        `void api.GET(${key});`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function check(file) {
  // A per-consumer project keeps the repository tsconfig out of the measured program.
  const project = `${file}.tsconfig.json`;
  writeFileSync(
    join(cache, project),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        module: 'NodeNext',
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        types: [],
      },
      files: [file],
    }),
  );
  const runs = Array.from({ length: 3 }, () => {
    const result = spawn.sync(
      compiler.command,
      [...compiler.args, ...compiler.benchmarkArgs, '--extendedDiagnostics', '-p', project],
      { cwd: cache, encoding: 'utf8', maxBuffer: 1 << 26 },
    );
    assert.equal(result.status, 0, `${file}\n${result.stdout.slice(0, 4000)}\n${result.stderr}`);
    return {
      instantiations: Number(/Instantiations:\s+(\d+)/.exec(result.stdout)?.[1]),
      memoryKB: Number(/Memory used:\s+(\d+)K/.exec(result.stdout)?.[1]),
      checkSeconds: Number.parseFloat(/Check time:\s+(\S+)/.exec(result.stdout)?.[1]),
      totalSeconds: Number.parseFloat(/Total time:\s+(\S+)/.exec(result.stdout)?.[1]),
    };
  });
  return runs.toSorted((a, b) => a.checkSeconds - b.checkSeconds)[1];
}

mkdirSync(cache, { recursive: true });
console.log(JSON.stringify(compilerInfo()));
for (const name of selected) {
  assert.ok(Object.hasOwn(schemas, name), `Unknown schema ${name}`);
  const document = await prepare(name);
  const eligible = eligibleOperations(document);
  const used = sample(eligible);
  const operations = Object.values(document.paths).reduce(
    (count, item) => count + methods.filter((method) => item[method]).length,
    0,
  );
  for (const scoped of [false, true]) {
    for (const client of ['openapi-chain', 'openapi-fetch']) {
      const file = `${name}.${client}.${scoped ? 'scoped' : 'full'}.mts`;
      writeFileSync(join(cache, file), consumer(name, client, used, scoped));
      console.log(
        JSON.stringify({
          schema: name,
          documentOperations: operations,
          eligibleOperations: eligible.length,
          usedOperations: used.length,
          paths: scoped ? used.length : Object.keys(document.paths).length,
          client,
          ...check(file),
        }),
      );
    }
  }
}
