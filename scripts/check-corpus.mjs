// Opt-in real-world qualification: runs the APIs.guru OpenAPI 3.x corpus through the metadata
// compiler and both clients, and with --types=N through CLI generation and typed consumers.
// The fixed fixture set runs in `pnpm check`; the full opt-in corpus downloads about 600 MB.
import { execFile, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { compiler } from './lib/compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values: options } = parseArgs({
  options: {
    cache: { type: 'string', default: join(root, '.cache/corpus') },
    dist: { type: 'string', default: join(root, 'packages/core/dist') },
    fixtures: { type: 'string' },
    baseline: { type: 'string' },
    'record-baseline': { type: 'string' },
    only: { type: 'string' },
    offline: { type: 'boolean', default: false },
    types: { type: 'string', default: '0' },
    compiler: { type: 'string' },
    workers: {
      type: 'string',
      default: String(Math.min(6, Math.max(1, availableParallelism() - 1))),
    },
  },
});
for (const [name, minimum] of [
  ['workers', 1],
  ['types', 0],
]) {
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`--${name} must be an integer >= ${minimum}.`);
}
const cache = resolve(options.cache);
const dist = resolve(options.dist);
if (options.baseline && options['record-baseline'])
  throw new Error('Choose --baseline or --record-baseline, not both.');
if (options.fixtures && !options.baseline && !options['record-baseline'])
  throw new Error('A local fixture run requires --baseline or --record-baseline.');
if (!existsSync(join(dist, 'metadata.js')))
  throw new Error(`Missing ${dist}; run pnpm build first.`);
mkdirSync(join(cache, 'specs'), { recursive: true });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);

async function download(url, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(encodeURI(url), { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((done) => setTimeout(done, 2000 * attempt));
    }
  }
}

async function pool(items, size, task) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

// 1. Corpus: the preferred APIs.guru versions, or a committed small fixture set.
const only = options.only ? new Set(options.only.split(',')) : undefined;
let listSha256;
let corpus;
if (options.fixtures) {
  const directory = resolve(options.fixtures);
  corpus = readdirSync(directory)
    .filter((file) => file.endsWith('.openapi.json'))
    .sort()
    .map((file) => ({
      name: file.slice(0, -'.openapi.json'.length),
      file: join(directory, file),
    }))
    .filter((document) => !only || only.has(document.name));
  if (!corpus.length) throw new Error(`No .openapi.json fixtures selected in ${directory}.`);
  listSha256 = sha256(JSON.stringify(corpus.map(({ name }) => name)));
} else {
  const listFile = join(cache, 'list.json');
  if (!existsSync(listFile)) {
    if (options.offline) throw new Error(`Missing ${listFile} in offline mode.`);
    await download('https://api.apis.guru/v2/list.json', listFile);
  }
  listSha256 = sha256(readFileSync(listFile));
  corpus = Object.entries(JSON.parse(readFileSync(listFile, 'utf8'))).flatMap(([name, api]) => {
    const entry = api.versions?.[api.preferred];
    if (!entry?.openapiVer?.startsWith('3') || (only && !only.has(name))) return [];
    return [
      {
        name,
        url: entry.swaggerUrl,
        file: join(cache, 'specs', `${name.replace(/[^\w.-]+/g, '_')}.json`),
      },
    ];
  });
}
const unavailable = [];
if (!options.offline && !options.fixtures) {
  const missing = corpus.filter((document) => !existsSync(document.file));
  if (missing.length) console.log(`downloading ${missing.length} documents into ${cache}`);
  await pool(missing, 4, async (document) => {
    try {
      await download(document.url, document.file);
    } catch (error) {
      unavailable.push(`${document.name}: ${error.message}`);
    }
  });
}
const documents = corpus.filter(
  (document) => existsSync(document.file) && statSync(document.file).size > 0,
);
for (const document of documents) {
  const bytes = readFileSync(document.file);
  document.bytes = bytes.length;
  document.sha256 = sha256(bytes);
}
console.log(
  `corpus: ${documents.length}/${corpus.length} documents, ` +
    `${(documents.reduce((sum, d) => sum + d.bytes, 0) / 1e6).toFixed(0)} MB, ` +
    `${options.fixtures ? 'fixture list' : 'list.json'} sha256 ${listSha256}`,
);
for (const line of unavailable) console.log(`  unavailable ${line}`);

// 2. Runtime pass: isolated workers with a per-document watchdog.
async function runtimePass() {
  const results = [];
  let next = 0;
  const worker = () =>
    new Promise((done) => {
      const child = fork(join(root, 'scripts/lib/corpus-worker.mjs'), [dist], {
        execArgv: ['--max-old-space-size=6144'],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let current;
      let timer;
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr = `${stderr}${chunk}`.slice(-2000)));
      const assign = () => {
        if (next >= documents.length) return void child.kill();
        current = documents[next++];
        timer = setTimeout(() => {
          results.push({ ...current, fatal: 'timeout' });
          current = undefined;
          child.kill('SIGKILL');
        }, 120_000);
        child.send(current.file);
      };
      child.on('message', (message) => {
        if (message.ready) return assign();
        clearTimeout(timer);
        results.push({ ...current, ...message });
        current = undefined;
        assign();
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (current) results.push({ ...current, fatal: `exit ${code ?? signal}`, stderr });
        done(next < documents.length ? worker() : undefined);
      });
    });
  await Promise.all(Array.from({ length: Number(options.workers) }, worker));
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// 3. Types pass: CLI generation, then typed strict/core calls through $path for up to 60
// operations per document, checked with the repository's TypeScript 6.
async function typesPass(count) {
  const largest = [...documents].sort((a, b) => b.bytes - a.bytes).slice(0, Math.min(10, count));
  const sample = [
    ...largest,
    ...documents
      .filter((document) => !largest.includes(document))
      .sort((a, b) => a.sha256.localeCompare(b.sha256))
      .slice(0, count - largest.length),
  ];
  const base = join(cache, 'types');
  mkdirSync(join(base, 'node_modules'), { recursive: true });
  const link = join(base, 'node_modules/openapi-chain');
  rmSync(link, { force: true });
  symlinkSync(join(root, 'packages/core'), link, 'junction');
  writeFileSync(join(base, 'package.json'), '{"private":true,"type":"module"}');
  writeFileSync(
    join(base, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
      },
    }),
  );
  const cli = join(root, 'packages/cli/src/cli.mjs');
  const results = [];
  await pool(sample, Math.min(4, Number(options.workers)), async (document) => {
    const work = join(base, document.name.replace(/[^\w.-]+/g, '_'));
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const result = { name: document.name, bytes: document.bytes };
    results.push(result);
    writeFileSync(
      join(work, 'config.json'),
      JSON.stringify({ schema: document.file, outDir: './api' }),
    );
    let started = performance.now();
    try {
      await run(process.execPath, [cli, 'generate', '--config', 'config.json'], {
        cwd: work,
        timeout: 600_000,
        maxBuffer: 1 << 26,
      });
      result.generate = { ok: true, ms: Math.round(performance.now() - started) };
    } catch (error) {
      const message = String(error.stderr || error.message)
        .trim()
        .split('\n')
        .at(-1);
      result.generate = { ok: false, error: message.slice(0, 300) };
      return;
    }
    const source = JSON.parse(readFileSync(document.file, 'utf8'));
    const operations = Object.entries(source.paths ?? {})
      .flatMap(([path, item]) =>
        ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
          .filter((method) => item?.[method])
          .map((method) => [JSON.stringify(path), method]),
      )
      .slice(0, 60);
    const lines = [
      "import { createClient, type OperationInputFor } from 'openapi-chain';",
      "import { createStrictClient } from 'openapi-chain/strict';",
      "import { metadata } from './api/metadata.js';",
      "import type { ScopedPaths } from './api/scope.js';",
      "const strict = createStrictClient<ScopedPaths>({ baseUrl: 'https://x.test', metadata });",
      "const core = createClient<ScopedPaths>({ baseUrl: 'https://x.test' });",
      'type Rest<T> = T extends [unknown, ...infer R] ? R : never;',
      ...operations.flatMap(([path, method], index) => [
        `export const s${index} = (input: OperationInputFor<ScopedPaths, ${path}, '${method}', true>, ...params: Rest<Parameters<typeof strict.$path<${path}>>>) => strict.$path(${path}, ...params).${method}(input);`,
        `export const c${index} = (input: OperationInputFor<ScopedPaths, ${path}, '${method}'>, ...params: Rest<Parameters<typeof core.$path<${path}>>>) => core.$path(${path}, ...params).${method}(input);`,
      ]),
    ];
    writeFileSync(join(work, 'consumer.ts'), `${lines.join('\n')}\n`);
    writeFileSync(join(work, 'package.json'), '{"type":"module"}');
    writeFileSync(
      join(work, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.base.json', include: ['consumer.ts'] }),
    );
    result.operations = operations.length;
    started = performance.now();
    let output = '';
    try {
      ({ stdout: output } = await run(
        compiler.command,
        [
          ...(compiler.command === process.execPath ? ['--max-old-space-size=8192'] : []),
          ...compiler.args,
          ...compiler.benchmarkArgs,
          '-p',
          '.',
          '--extendedDiagnostics',
        ],
        { cwd: work, timeout: 900_000, maxBuffer: 1 << 26 },
      ));
    } catch (error) {
      output = String(error.stdout ?? error.message);
    }
    const errors = output.split('\n').filter((line) => /error TS/.test(line));
    const number = (pattern) => Number(pattern.exec(output)?.[1]?.replaceAll(',', ''));
    result.tsc = {
      ok: errors.length === 0 && /Instantiations:/.test(output),
      errors: errors.slice(0, 4),
      instantiations: number(/Instantiations:\s+([\d,]+)/),
      memoryMB: Math.round(number(/Memory used:\s+([\d,]+)K/) / 1024),
      ms: Math.round(performance.now() - started),
    };
  });
  return results;
}

// 4. Report: grouped outcomes. A reviewed baseline can additionally gate every
// document's compilation and request outcome without treating known third-party
// schema defects as new regressions.
const location = /^(?:[A-Z]+ \S+: )?(?:.*? request body: )?/;
const normalize = (message = '') =>
  message
    .replace(location, '')
    .replace(
      /\b(parameter|Parameter|property|Property|field|key|encoding|Encoding)\s+\S+/g,
      '$1 <name>',
    )
    .replace(
      /\b(?:application|text|multipart|image|audio|video|font|model|\*)\/[\w.+*-]+(?:;[^\s,]*)?/g,
      '<media>',
    )
    .replace(/(^|\s)\/\S*/g, '$1<path>')
    .slice(0, 140);
function groups(entries, top = 8) {
  const grouped = new Map();
  for (const { key, name, example } of entries) {
    const group = grouped.get(key) ?? { documents: new Set(), count: 0, example };
    group.documents.add(name);
    group.count++;
    grouped.set(key, group);
  }
  return [...grouped]
    .sort((a, b) => b[1].documents.size - a[1].documents.size || b[1].count - a[1].count)
    .slice(0, top)
    .map(
      ([key, group]) =>
        `  ${group.documents.size} docs / ${group.count} ops: ${key}\n      e.g. ${group.example}`,
    );
}
const percentile = (values, p) =>
  values.length
    ? values.toSorted((a, b) => a - b)[Math.min(values.length - 1, Math.floor(p * values.length))]
    : 0;

const runtime = await runtimePass();
const compiled = runtime.filter((r) => r.compile?.kind === 'ok');
const failed = runtime.filter((r) => r.compile && r.compile.kind !== 'ok');
const records = runtime.flatMap((r) =>
  (r.smoke?.records ?? []).map((record) => ({ ...record, name: r.name })),
);
const crashes = [
  ...runtime.filter(
    (r) =>
      r.fatal ||
      r.parse ||
      r.smokeError ||
      [r.compile?.kind, r.compileAllow?.kind].includes('crash'),
  ),
  ...records.filter((record) => record.kind === 'crash'),
];
const counts = {};
for (const r of runtime)
  for (const [key, value] of Object.entries(r.smoke?.counts ?? {}))
    counts[key] = (counts[key] ?? 0) + value;
console.log(
  `\ncompile: ${compiled.length} ok, ${failed.length} failed ` +
    `(${failed.filter((r) => r.compileAllow?.kind === 'ok').length} compile with onAmbiguousTemplate: 'allow'); ` +
    `ms p50=${percentile(
      runtime.map((r) => r.compile?.ms ?? 0),
      0.5,
    ).toFixed(1)} ` +
    `p99=${percentile(
      runtime.map((r) => r.compile?.ms ?? 0),
      0.99,
    ).toFixed(1)} ` +
    `max=${percentile(
      runtime.map((r) => r.compile?.ms ?? 0),
      1,
    ).toFixed(0)}`,
);
console.log(
  groups(
    failed.map((r) => ({
      key: normalize(r.compile.message),
      name: r.name,
      example: `${r.name}: ${r.compile.message.slice(0, 160)}`,
    })),
    12,
  ).join('\n'),
);
for (const client of ['strict', 'core']) {
  for (const variant of ['minimal', 'full']) {
    const prefix = `${client}:${variant}:`;
    const entries = Object.entries(counts).filter(([key]) => key.startsWith(prefix));
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    console.log(
      `\n${client} ${variant} (${total} operations): ${entries.map(([key, value]) => `${key.slice(prefix.length)} ${value}`).join(', ')}`,
    );
    if (variant === 'minimal')
      console.log(
        groups(
          records
            .filter((record) => record.client === client && record.variant === variant)
            .map((record) => ({
              key: `${record.kind} ${record.code ?? ''}: ${normalize(record.message)}`,
              name: record.name,
              example: `${record.name} ${record.method.toUpperCase()} ${record.template}`,
            })),
        ).join('\n'),
      );
  }
}
for (const crash of crashes)
  console.log(`CRASH ${crash.name} ${crash.fatal ?? crash.message ?? crash.smokeError?.message}`);

let typeFailures = 0;
const types = Number(options.types) > 0 ? await typesPass(Number(options.types)) : [];
if (types.length) {
  const generated = types.filter((r) => r.generate?.ok);
  const checked = generated.filter((r) => r.tsc?.ok);
  typeFailures = generated.length - checked.length;
  console.log(
    `\ntypes: ${generated.length}/${types.length} generated, ${checked.length} typed consumers passed ` +
      `(${checked.reduce((sum, r) => sum + r.operations * 2, 0)} typed calls); instantiations ` +
      `p50=${percentile(
        checked.map((r) => r.tsc.instantiations),
        0.5,
      )} p90=${percentile(
        checked.map((r) => r.tsc.instantiations),
        0.9,
      )} ` +
      `max=${percentile(
        checked.map((r) => r.tsc.instantiations),
        1,
      )}; check ms p50=${percentile(
        checked.map((r) => r.tsc.ms),
        0.5,
      )} ` +
      `max=${percentile(
        checked.map((r) => r.tsc.ms),
        1,
      )}`,
  );
  console.log(
    groups(
      types
        .filter((r) => !r.generate?.ok)
        .map((r) => ({
          key: normalize(r.generate.error.replace(/^openapi-chain: /, '')),
          name: r.name,
          example: r.name,
        })),
    ).join('\n'),
  );
  for (const r of generated.filter((r) => !r.tsc?.ok))
    console.log(`TYPE ERRORS ${r.name}: ${r.tsc?.errors.join(' | ').slice(0, 400)}`);
}

writeFileSync(join(cache, 'results.json'), JSON.stringify({ listSha256, dist, runtime, types }));
console.log(`\nresults: ${join(cache, 'results.json')}`);

const outcome = (value) =>
  value &&
  Object.fromEntries(
    ['kind', 'code', 'message']
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
const sorted = (value) =>
  [...value].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const baselineSnapshot = {
  formatVersion: 1,
  listSha256,
  documents: runtime.map((result) => ({
    name: result.name,
    sha256: result.sha256,
    ...(result.fatal ? { fatal: result.fatal } : {}),
    ...(result.parse ? { parse: result.parse } : {}),
    compile: outcome(result.compile),
    ...(result.compileAllow ? { compileAllow: outcome(result.compileAllow) } : {}),
    ...(result.smokeError ? { smokeError: outcome(result.smokeError) } : {}),
    counts: Object.fromEntries(
      Object.entries(result.smoke?.counts ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
    failures: sorted(
      (result.smoke?.records ?? []).map((record) => ({
        client: record.client,
        variant: record.variant,
        method: record.method,
        template: record.template,
        ...outcome(record),
      })),
    ),
  })),
  types: types
    .map((result) => ({
      name: result.name,
      generate: result.generate?.ok === true ? 'ok' : result.generate?.error,
      ...(result.tsc ? { tsc: result.tsc.ok === true ? 'ok' : result.tsc.errors } : {}),
      ...(result.operations !== undefined ? { operations: result.operations } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
};
if (options['record-baseline']) {
  if (
    crashes.length ||
    typeFailures ||
    unavailable.length ||
    documents.length !== corpus.length ||
    runtime.length !== documents.length
  )
    throw new Error('Cannot record a baseline while crashes, type errors or downloads remain.');
  writeFileSync(
    resolve(options['record-baseline']),
    `${JSON.stringify(baselineSnapshot, null, 2)}\n`,
  );
  console.log(`baseline recorded: ${resolve(options['record-baseline'])}`);
}
if (options.baseline) {
  const expected = JSON.parse(readFileSync(resolve(options.baseline), 'utf8'));
  if (
    expected.formatVersion !== 1 ||
    !Array.isArray(expected.documents) ||
    expected.documents.some((entry) => !Array.isArray(entry.failures)) ||
    !Array.isArray(expected.types)
  )
    throw new Error(`Unsupported corpus baseline: ${resolve(options.baseline)}`);
  const differences = [];
  if (expected.listSha256 !== baselineSnapshot.listSha256)
    differences.push('corpus document list changed');
  const beforeDocuments = new Map(expected.documents.map((entry) => [entry.name, entry]));
  const afterDocuments = new Map(baselineSnapshot.documents.map((entry) => [entry.name, entry]));
  for (const name of new Set([...beforeDocuments.keys(), ...afterDocuments.keys()])) {
    const before = beforeDocuments.get(name);
    const after = afterDocuments.get(name);
    if (!before || !after) {
      differences.push(`document ${name}: ${before ? 'missing' : 'new'}`);
      continue;
    }
    for (const field of [
      'sha256',
      'fatal',
      'parse',
      'compile',
      'compileAllow',
      'smokeError',
      'counts',
    ])
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        differences.push(`document ${name}: ${field} changed`);
    const previousFailures = new Set(before.failures.map((entry) => JSON.stringify(entry)));
    const currentFailures = new Set(after.failures.map((entry) => JSON.stringify(entry)));
    for (const failure of after.failures)
      if (!previousFailures.has(JSON.stringify(failure)))
        differences.push(
          `document ${name}: new ${failure.kind} ${failure.code ?? ''} ` +
            `${failure.client}:${failure.variant} ${failure.method.toUpperCase()} ${failure.template}`,
        );
    for (const failure of before.failures)
      if (!currentFailures.has(JSON.stringify(failure)))
        differences.push(
          `document ${name}: resolved/changed ${failure.kind} ${failure.code ?? ''} ` +
            `${failure.client}:${failure.variant} ${failure.method.toUpperCase()} ${failure.template}`,
        );
  }
  const beforeTypes = new Map(expected.types.map((entry) => [entry.name, entry]));
  const afterTypes = new Map(baselineSnapshot.types.map((entry) => [entry.name, entry]));
  for (const name of new Set([...beforeTypes.keys(), ...afterTypes.keys()])) {
    if (JSON.stringify(beforeTypes.get(name)) !== JSON.stringify(afterTypes.get(name)))
      differences.push(`types ${name}: generation or typecheck outcome changed`);
  }
  for (const difference of differences.slice(0, 20)) console.error(`BASELINE ${difference}`);
  if (differences.length > 20)
    console.error(`BASELINE ... and ${differences.length - 20} more changes`);
  if (differences.length) process.exitCode = 1;
  else console.log(`baseline matches: ${resolve(options.baseline)}`);
}
if (
  crashes.length ||
  typeFailures ||
  unavailable.length ||
  !documents.length ||
  documents.length !== corpus.length ||
  runtime.length !== documents.length
)
  process.exitCode = 1;
