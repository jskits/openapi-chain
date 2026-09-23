import { OpenAPIChainError } from './errors.js';
/** Both entry points expose the same response extension contract. */
export function responseExtensionData(value: unknown, status: number): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('status' in value) ||
    value.status !== status ||
    !('data' in value)
  )
    throw new OpenAPIChainError('EXTENSION_CONTRACT', 'Response status mismatch or missing data.');
  return value.data;
}
