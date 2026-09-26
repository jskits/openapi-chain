import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';
import type { OpenAPIMetadata, CompiledOpenAPIMetadata } from '../packages/core/src/metadata.js';
// @ts-expect-error partial tables have no supported runtime constructor
import { defineOpenAPIMetadata } from '../packages/core/src/metadata.js';

const partial = { version: 1, operations: {} } satisfies OpenAPIMetadata;
// @ts-expect-error a partial table is not a compiled serialization artifact
const uncompiled: CompiledOpenAPIMetadata = partial;
const compiled: CompiledOpenAPIMetadata = compileOpenAPIMetadata({
  openapi: '3.1.0',
  paths: {},
});
void [compiled, uncompiled, defineOpenAPIMetadata];
