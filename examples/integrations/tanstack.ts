import { mutationOptions, queryOptions } from '@tanstack/react-query';
import type { Catalog, DetailInput } from './api.js';
import { catalogDetail } from './query.js';

export function catalogQueries(api: Catalog, cacheScope: string) {
  const detail = catalogDetail(api, cacheScope);
  return {
    prefix: detail.prefix,
    detail: (input: DetailInput) => queryOptions(detail.queryOptions(input)),
    update: () =>
      mutationOptions({
        mutationFn: ({ id, label }: { id: string; label: string }) =>
          api.items(id).patch({
            contentType: 'application/json',
            body: { label },
          }),
      }),
  };
}
