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
    throw new TypeError(
      'Strict client requires complete version 1 compiled metadata with an operations record.',
    );
  for (const [path, methods] of Object.entries(value.operations)) {
    if (!path.startsWith('/') || !record(methods))
      throw new TypeError(`Invalid metadata route: ${path}`);
    for (const [method, operation] of Object.entries(methods)) {
      if (!httpMethods.some((candidate) => candidate === method) || !record(operation))
        throw new TypeError(`Invalid metadata operation: ${method} ${path}`);
    }
  }
}
