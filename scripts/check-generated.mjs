import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-schema-'));
function run(args) {
  const result = spawn.sync('pnpm', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}
try {
  for (const [input, fixture] of [
    ['examples/example.yaml', 'examples/schema.d.ts'],
    ['examples/service.openapi.json', 'examples/service-schema.d.ts'],
    ['test/fixtures/conformance.openapi.json', 'test/fixtures/conformance-schema.d.ts'],
  ]) {
    const output = join(directory, 'schema.d.ts');
    run(['exec', 'openapi-typescript', input, '-o', output]);
    run(['exec', 'oxfmt', '--config', '.oxfmtrc.json', '--write', output]);
    assert.equal(
      readFileSync(output, 'utf8'),
      readFileSync(join(root, fixture), 'utf8'),
      `${fixture} is stale. Run pnpm generate:example, then pnpm format.`,
    );
  }
  console.log('Pinned OpenAPI generator matches the typechecked consumer fixture.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
