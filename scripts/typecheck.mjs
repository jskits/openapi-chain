import assert from 'node:assert/strict';
import spawn from 'cross-spawn';
import { compiler } from './lib/compiler.mjs';
console.log(`Typechecking with ${compiler.version}`);
const result = spawn.sync(compiler.command, [...compiler.args, '--noEmit'], { stdio: 'inherit' });
assert.equal(result.status, 0, 'Typecheck failed.');
