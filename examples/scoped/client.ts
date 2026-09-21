import { createStrictClient } from '../../src/strict.js';
import type { Transport } from '../../src/index.js';
import { metadata } from './metadata.js';
import type { ScopedPaths } from './scope.js';

// In an installed application, import the clients/types from openapi-chain[/strict].
export function createCatalog(baseUrl: string, transport?: Transport) {
  return createStrictClient<ScopedPaths>({
    baseUrl,
    metadata,
    ...(transport ? { transport } : {}),
  });
}
