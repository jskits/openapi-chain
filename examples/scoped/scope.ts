import type { paths } from './schema.js';

// Include the collection endpoint explicitly: '/items/{id}' does not include '/items'.
export const selectedPaths = ['/items', '/items/{id}'] as const satisfies readonly (keyof paths)[];
export type ScopedPaths = Pick<paths, (typeof selectedPaths)[number]>;
