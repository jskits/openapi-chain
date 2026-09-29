import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';

// Each entry imports the client factory an application uses, so consumers' tree shaking applies
// equally. Entries live under node_modules/.cache so bare package specifiers resolve.
const entries = {
  core: `export { createClient, HttpError } from 'openapi-chain';`,
  strict: `export { createStrictClient } from 'openapi-chain/strict';`,
  metadata: `export { compileOpenAPIMetadata } from 'openapi-chain/metadata';`,
  openapiFetchAdapter: `export { withOpenAPISerialization } from 'openapi-chain/openapi-fetch';`,
  openapiFetch: `export { default } from 'openapi-fetch';`,
  openapiTypescriptFetch: `export { Fetcher } from 'openapi-typescript-fetch';`,
  featureFetch: `export { createApiFetchClient } from 'feature-fetch';`,
  axios: `export { default } from 'axios';`,
  superagent: `export { default } from 'superagent';`,
};
const cache = fileURLToPath(new URL('../node_modules/.cache', import.meta.url));
mkdirSync(cache, { recursive: true });
const directory = mkdtempSync(join(cache, 'openapi-chain-size-'));
try {
  for (const [label, source] of Object.entries(entries)) {
    const entry = join(directory, `${label}.mjs`);
    writeFileSync(entry, source);
    const outDir = join(directory, 'out', label);
    await build({
      config: false,
      entry: { entry },
      outDir,
      format: ['esm'],
      target: 'es2022',
      // Browser conditions select the Fetch/XHR builds that client applications ship.
      platform: 'browser',
      deps: { alwaysBundle: /.*/ },
      minify: true,
      dts: false,
      sourcemap: false,
      publint: false,
      attw: false,
      logLevel: 'silent',
    });
    assert.deepEqual(
      readdirSync(outDir),
      ['entry.js'],
      'Comparison requires one self-contained bundle',
    );
    const bytes = readFileSync(join(outDir, 'entry.js'));
    console.log(
      JSON.stringify({
        entry: label,
        minifiedBytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
