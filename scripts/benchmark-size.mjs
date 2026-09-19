import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';

const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-size-'));
try {
  const entries = {
    core: new URL('../dist/index.js', import.meta.url),
    strict: new URL('../dist/strict.js', import.meta.url),
    metadata: new URL('../dist/metadata.js', import.meta.url),
    openapiFetch: new URL(import.meta.resolve('openapi-fetch')),
  };
  for (const [label, url] of Object.entries(entries)) {
    const outDir = join(directory, label);
    await build({
      config: false,
      entry: { entry: fileURLToPath(url) },
      outDir,
      format: ['esm'],
      target: 'es2022',
      platform: 'neutral',
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
