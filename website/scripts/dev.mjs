// Start `next dev` with pages synchronized from the repository and kept up to date on edits.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { syncDocs, watchSources } from './sync-docs.mjs';

console.log(`[sync-docs] ${syncDocs()} pages generated`);
watchSources();
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
