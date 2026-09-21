import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';
import { compileOpenAPIMetadata } from '../dist/metadata.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-delivery-'));
const document = {
  openapi: '3.1.0',
  info: { title: 'BUILD_ONLY_SCHEMA_SENTINEL', version: '1' },
  paths: Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [
      `/r${i}`,
      {
        get: {
          parameters: [
            {
              name: 'filter',
              in: 'query',
              style: 'deepObject',
              explode: true,
              schema: { type: 'object' },
            },
          ],
          responses: {
            200: {
              description: `Response for synthetic endpoint ${i}`,
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                },
              },
            },
          },
        },
      },
    ]),
  ),
};
try {
  for (const mode of ['runtime-compile', 'build-compile-full', 'build-compile-50']) {
    const paths =
      mode === 'build-compile-50' ? Object.keys(document.paths).slice(0, 50) : undefined;
    const metadata = compileOpenAPIMetadata(document, paths ? { paths } : {});
    const header =
      mode === 'runtime-compile'
        ? `import {compileOpenAPIMetadata} from ${JSON.stringify(join(root, 'dist/metadata.js'))};\nconst metadata = compileOpenAPIMetadata(${JSON.stringify(document)});`
        : `const metadata = ${JSON.stringify(metadata)};`;
    const entry = join(directory, `${mode}.mjs`);
    writeFileSync(
      entry,
      `import {createStrictClient} from ${JSON.stringify(join(root, 'dist/strict.js'))};\n${header}\nexport const create = transport => createStrictClient({baseUrl:'https://api.test',metadata,transport});`,
    );
    const modules = new Set();
    const outDir = join(directory, mode);
    await build({
      config: false,
      entry: { entry },
      outDir,
      format: ['esm'],
      platform: 'browser',
      target: 'es2022',
      deps: { alwaysBundle: /.*/ },
      minify: true,
      dts: false,
      sourcemap: false,
      publint: false,
      attw: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'record-modules',
          transform(_code, id) {
            modules.add(id);
          },
        },
      ],
    });
    const output = join(outDir, 'entry.js');
    const bytes = readFileSync(output);
    const hasCompiler = [...modules].some((id) => id.endsWith('/dist/metadata.js'));
    assert.equal(hasCompiler, mode === 'runtime-compile');
    assert.equal(bytes.includes('BUILD_ONLY_SCHEMA_SENTINEL'), mode === 'runtime-compile');
    assert.equal(bytes.includes('/r999'), mode !== 'build-compile-50');
    const { create } = await import(pathToFileURL(output).href);
    const urls = [];
    const api = create(async (r) => {
      urls.push(r.url);
      return new Response(null, { status: 204 });
    });
    await api.r0.get({ query: { filter: { name: 'book' } } });
    assert.deepEqual(urls, ['https://api.test/r0?filter%5Bname%5D=book']);
    if (mode === 'build-compile-50') {
      await assert.rejects(api.r999.get(), /does not match/);
      assert.equal(urls.length, 1);
    }
    console.log(
      JSON.stringify({
        mode,
        routes: 1000,
        selected: paths?.length ?? 1000,
        documentGzip: gzipSync(JSON.stringify(document), { level: 9 }).length,
        metadataGzip: gzipSync(JSON.stringify(metadata), { level: 9 }).length,
        consumerGzip: gzipSync(bytes, { level: 9 }).length,
        compilerInBundle: hasCompiler,
      }),
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
