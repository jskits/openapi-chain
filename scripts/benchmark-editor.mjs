import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { typeFixture } from './lib/type-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const native = process.env.OPENAPI_CHAIN_TSC;
const samples = 3;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function session() {
  const child = native
    ? spawn(native, ['--lsp', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(
        process.execPath,
        [
          join(root, 'node_modules/typescript/lib/tsserver.js'),
          '--disableAutomaticTypingAcquisition',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
  let seq = 0;
  let buffer = Buffer.alloc(0);
  let stderr = '';
  const pending = new Map();
  child.stderr.on('data', (data) => {
    stderr += String(data);
  });
  const send = (message) => {
    const json = JSON.stringify(message);
    child.stdin.write(
      native ? `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}` : `${json}\n`,
    );
  };
  child.stdout.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (true) {
      const boundary = buffer.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      const size = Number(
        /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, boundary).toString())?.[1],
      );
      assert.ok(Number.isFinite(size));
      if (buffer.length < boundary + 4 + size) return;
      const message = JSON.parse(buffer.subarray(boundary + 4, boundary + 4 + size).toString());
      buffer = buffer.subarray(boundary + 4 + size);
      if (native && message.method && message.id !== undefined) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          result:
            message.method === 'workspace/configuration'
              ? message.params.items.map(() => ({}))
              : null,
        });
        continue;
      }
      const key = native ? message.id : message.request_seq;
      const callback = pending.get(key);
      if (callback) {
        pending.delete(key);
        clearTimeout(callback.timer);
        if (message.error || message.success === false)
          callback.reject(new Error(JSON.stringify(message)));
        else callback.resolve(native ? message.result : message.body);
      }
    }
  });
  const fail = (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', (code) => fail(new Error(`Language server exited ${code}: ${stderr}`)));
  return {
    notify(method, params) {
      send(
        native
          ? { jsonrpc: '2.0', method, params }
          : { seq: ++seq, type: 'request', command: method, arguments: params },
      );
    },
    request(method, params) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Language server timeout: ${method}\n${stderr}`));
          child.kill();
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        send(
          native
            ? { jsonrpc: '2.0', id, method, params }
            : { seq: id, type: 'request', command: method, arguments: params },
        );
      });
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill();
        await closed;
      }
    },
  };
}

console.log(
  JSON.stringify({
    protocol: native ? 'native LSP' : 'tsserver',
    compiler: execFileSync(native ?? join(root, 'node_modules/.bin/tsc'), ['--version'], {
      encoding: 'utf8',
    }).trim(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    samples,
  }),
);
for (const [routes, selected] of [
  [1000, 1000],
  [5000, 5000],
  [5000, 250],
]) {
  const measurements = [];
  for (let sample = 0; sample < samples; sample++) {
    const directory = mkdtempSync(join(tmpdir(), 'openapi-chain-editor-'));
    const file = join(directory, 'consumer.mts');
    const text = typeFixture(root, routes, selected) + '\napi.\n';
    writeFileSync(file, text);
    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, target: 'ES2022', module: 'NodeNext' },
        files: ['consumer.mts'],
      }),
    );
    const line = text.slice(0, text.lastIndexOf('api.')).split('\n').length;
    const uri = pathToFileURL(file).href;
    const server = session();
    try {
      if (native) {
        await server.request('initialize', {
          processId: process.pid,
          rootUri: pathToFileURL(directory).href,
          capabilities: {},
        });
        server.notify('initialized', {});
        server.notify('textDocument/didOpen', {
          textDocument: { uri, languageId: 'typescript', version: 1, text },
        });
      } else server.notify('open', { file, fileContent: text, projectRootPath: directory });
      const complete = async () => {
        const start = performance.now();
        const result = native
          ? await server.request('textDocument/completion', {
              textDocument: { uri },
              position: { line: line - 1, character: 4 },
            })
          : await server.request('completionInfo', { file, line, offset: 5 });
        const elapsed = performance.now() - start;
        const entries = native ? (Array.isArray(result) ? result : result?.items) : result?.entries;
        assert.ok(
          entries?.some((entry) => (entry.label ?? entry.name) === 'r0'),
          'Completion must actually include route r0',
        );
        assert.ok(entries?.some((entry) => (entry.label ?? entry.name) === `r${selected - 1}`));
        if (selected < routes)
          assert.ok(!entries.some((entry) => (entry.label ?? entry.name) === `r${selected}`));
        return Math.round(elapsed * 10) / 10;
      };
      const cold = await complete();
      const unchanged = await complete();
      const editStart = performance.now();
      if (native)
        server.notify('textDocument/didChange', {
          textDocument: { uri, version: 2 },
          contentChanges: [
            {
              range: { start: { line: 0, character: 9 }, end: { line: 0, character: 10 } },
              text: 'b',
            },
          ],
        });
      else
        await server.request('updateOpen', {
          changedFiles: [
            {
              fileName: file,
              textChanges: [
                { start: { line: 1, offset: 10 }, end: { line: 1, offset: 11 }, newText: 'b' },
              ],
            },
          ],
        });
      await complete();
      const edited = Math.round((performance.now() - editStart) * 10) / 10;
      measurements.push({ cold, unchanged, edited });
    } finally {
      await server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log(
    JSON.stringify({
      routes,
      selected,
      measurements,
      medianMs: Object.fromEntries(
        ['cold', 'unchanged', 'edited'].map((key) => [
          key,
          median(measurements.map((m) => m[key])),
        ]),
      ),
    }),
  );
}
