import { createClient } from '../../packages/core/src/index.js';

export type Item = { id: string; label: string };
type Paths = {
  '/items/{id}': {
    parameters: { path: { id: string } };
    get: {
      parameters: { query?: { locale?: string } };
      responses: {
        200: { content: { 'application/json': Item } };
        404: { content: { 'application/json': { message: string } } };
      };
    };
    patch: {
      requestBody: { content: { 'application/json': { label: string } } };
      responses: { 200: { content: { 'application/json': Item } } };
    };
  };
};

// Application code imports createClient from '@openapi-chain/core'.
export function createCatalog(baseUrl: string, token: string) {
  return createClient<Paths>({ baseUrl, headers: { authorization: `Bearer ${token}` } });
}
export type Catalog = ReturnType<typeof createCatalog>;
export type DetailInput = { id: string; locale: string };
