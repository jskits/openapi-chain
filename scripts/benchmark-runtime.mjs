import { performance } from 'node:perf_hooks';
import createFetchClient from 'openapi-fetch';
import { createClient } from '../dist/index.js';
import { createStrictClient } from '../dist/strict.js';
import { compileOpenAPIMetadata } from '../dist/metadata.js';

// Same Fetch replacement, URL, empty HTTP 204 response, warmup and sample count.
const fetch = async () => new Response(null, { status: 204 });
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
for (const count of [10, 1000, 10000]) {
  const paths = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`/r${i}`, { get: {} }]),
  );
  const start = performance.now();
  const metadata = compileOpenAPIMetadata({ openapi: '3.1.0', paths });
  const compileMs = performance.now() - start;
  const options = { baseUrl: 'https://example.test', fetch };
  const core = createClient(options);
  const strictStart = performance.now();
  const strict = createStrictClient({ ...options, metadata });
  const indexMs = performance.now() - strictStart;
  const reference = createFetchClient(options);
  const route = `r${count - 1}`;
  const cases = {
    core: () => core[route].get(),
    strictChain: () => strict[route].get(),
    strictPath: () => strict.$path(`/${route}`).get(),
    openapiFetch: () => reference.GET(`/${route}`),
  };
  const microseconds = {};
  for (const [label, run] of Object.entries(cases)) {
    for (let i = 0; i < 100; i++) await run();
    const samples = [];
    for (let sample = 0; sample < 5; sample++) {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) await run();
      samples.push(performance.now() - start);
    }
    microseconds[label] = Number(median(samples).toFixed(2));
  }
  console.log(
    JSON.stringify({
      routes: count,
      compileMs: +compileMs.toFixed(2),
      indexMs: +indexMs.toFixed(2),
      microsecondsPerRequest: microseconds,
    }),
  );
}
