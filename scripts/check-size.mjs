import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = new URL('../packages/core/dist/', import.meta.url);
const seen = new Set();
const chunks = [];

function visit(file) {
  const path = normalize(file);
  if (seen.has(path)) return;
  seen.add(path);
  const source = readFileSync(path, 'utf8');
  chunks.push(source);
  const imports = /(?:from\s*|import\s*)["'](\.[^"']+)["']/g;
  for (const match of source.matchAll(imports)) {
    let child = join(dirname(path), match[1]);
    if (!/\.[cm]?js$/.test(child) && existsSync(`${child}.js`)) child += '.js';
    if (existsSync(child)) visit(child);
  }
}

visit(fileURLToPath(new URL('index.js', root)));
const bytes = gzipSync(chunks.join('\n'), { level: 9 }).byteLength;
const limit = 3072;
console.log(
  `core transitive gzip: ${bytes} B / ${limit} B (${seen.size} file${seen.size === 1 ? '' : 's'})`,
);
if (bytes > limit) throw new Error(`Core bundle gzip regression: ${bytes} B exceeds ${limit} B.`);
