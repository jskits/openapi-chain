import { mutationOptions, queryOptions } from '@tanstack/react-query';
import type { Catalog, DetailInput } from './api.js';

export function catalogQueries(api: Catalog, cacheScope: string) {
  const prefix = [cacheScope, 'GET', '/items/{id}'] as const;
  return {
    prefix,
    detail: (input: DetailInput) =>
      queryOptions({
        queryKey: [...prefix, input] as const,
        queryFn: ({ queryKey: [, , , params], signal }) =>
          api.items(params.id).get({
            query: { locale: params.locale },
            init: { signal },
          }),
      }),
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
