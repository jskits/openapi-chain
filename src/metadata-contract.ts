import { OpenAPIChainError } from './errors.js';
import { httpMethods } from './constant.js';
import type { CompiledOpenAPIMetadata } from './type.js';

function record(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

/** Validate the public artifact envelope before building any strict runtime state. */
export function assertMetadata(value: unknown): asserts value is CompiledOpenAPIMetadata {
  if (!record(value) || value.version !== 1 || value.complete !== true || !record(value.operations))
    throw new OpenAPIChainError(
      'METADATA_MISMATCH',
      'Strict client requires complete version 1 compiled metadata with an operations record.',
    );
  for (const [path, methods] of Object.entries(value.operations)) {
    if (!path.startsWith('/') || !record(methods))
      throw new OpenAPIChainError('METADATA_MISMATCH', `Invalid metadata route: ${path}`);
    for (const [method, operation] of Object.entries(methods)) {
      if (!httpMethods.some((candidate) => candidate === method) || !record(operation))
        throw new OpenAPIChainError(
          'METADATA_MISMATCH',
          `Invalid metadata operation: ${method} ${path}`,
        );
    }
  }
}

/** Snapshot caller-owned artifacts, including JSON.parse-generated CLI metadata. */
export function snapshotMetadata(value: unknown): CompiledOpenAPIMetadata {
  assertMetadata(value);
  const snapshot = structuredClone(value);
  const pending: object[] = [snapshot];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    // structuredClone restores Object.prototype on dictionaries. Missing field
    // metadata must stay absent even for names such as constructor or __proto__.
    if (record(current)) Object.setPrototypeOf(current, null);
    for (const item of Object.values(current)) {
      if (item !== null && typeof item === 'object') pending.push(item as object);
    }
    Object.freeze(current);
  }
  return snapshot;
}
