import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { compileOpenAPIMetadata } from '../dist/metadata.js';

// Small documents with exponentially many paths through a shared DAG.
// Operation-count regression checks live in schema-work.test.ts; wall time here
// is descriptive and is not a noisy CI timing threshold.
for (const depth of [8, 12, 16, 20, 28]) {
  const schemas = { N0: { type: 'string' } };
  for (let i = 1; i <= depth; i++)
    schemas[`N${i}`] = {
      allOf: [
        { $ref: `#/components/schemas/N${i - 1}` },
        { $ref: `#/components/schemas/N${i - 1}` },
      ],
    };
  const schema = {
    type: 'object',
    properties: { value: { $ref: `#/components/schemas/N${depth}` } },
  };
  const requestBody = { content: { 'multipart/form-data': { schema } } };
  const document = {
    openapi: '3.1.1',
    info: { title: 'Shared schema DAG', version: '1' },
    components: { schemas },
    paths: { '/x': { post: { responses: { 204: { description: 'OK' } }, requestBody } } },
  };
  const start = performance.now();
  const metadata = compileOpenAPIMetadata(document);
  const elapsed = performance.now() - start;
  assert.equal(
    metadata.operations['/x'].post.requestBody.media['multipart/form-data'].propertyContentTypes
      .value,
    'text/plain',
  );
  console.log(
    JSON.stringify({
      depth,
      documentBytes: Buffer.byteLength(JSON.stringify(document)),
      compileMs: +elapsed.toFixed(2),
    }),
  );
}
