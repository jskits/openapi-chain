#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const help = `Usage: openapi-chain generate [--config <file>] [--check]

Generate types, scope, metadata and a provenance manifest from one local schema.

  --config <file>  JSON config (default: openapi-chain.config.json)
  --check          Check all generated files without writing anything
  --help          Show this help
  --version       Show the CLI version
`;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      check: { type: 'boolean' },
      help: { type: 'boolean' },
      version: { type: 'boolean' },
    },
  });
  if (values.help) console.log(help);
  else if (values.version) console.log(createRequire(import.meta.url)('../package.json').version);
  else {
    if (positionals.length !== 1 || positionals[0] !== 'generate') throw new Error(help);
    const { generate } = await import('./generate.mjs');
    const result = await generate(values.config ?? 'openapi-chain.config.json', {
      check: values.check,
    });
    console.log(
      `${values.check ? 'Verified' : result.changed ? 'Generated' : 'Unchanged'} ${result.selectedPaths.length} paths: ${result.outDir}`,
    );
  }
} catch (error) {
  console.error(`openapi-chain: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
