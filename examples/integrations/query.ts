import { createQuery } from '../../packages/query/src/index.js';
import type { Catalog, DetailInput } from './api.js';

// Application code imports createQuery from '@openapi-chain/query'.
export function catalogDetail(api: Catalog, cacheScope: string) {
  return createQuery({
    key: [cacheScope, 'GET', '/items/{id}'],
    fetcher: (params: DetailInput, { signal }) =>
      api.items(params.id).get({
        query: { locale: params.locale },
        init: { signal },
      }),
  });
}
