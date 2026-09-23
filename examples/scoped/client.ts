import { createStrictClient } from '@openapi-chain/core/strict';
import type { Transport } from '@openapi-chain/core';
import { metadata } from './generated/metadata.js';
import type { ScopedPaths } from './generated/scope.js';

export function createCatalog(baseUrl: string, transport?: Transport) {
  return createStrictClient<ScopedPaths>({
    baseUrl,
    metadata,
    ...(transport ? { transport } : {}),
  });
}
