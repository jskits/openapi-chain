import type { Catalog, DetailInput } from './api.js';

export function catalogSWR(api: Catalog, cacheScope: string) {
  return (input: DetailInput | null) => ({
    key: input === null ? null : ([cacheScope, 'GET', '/items/{id}', input] as const),
    fetcher: ([, , , params]: readonly [string, string, string, DetailInput]) =>
      api.items(params.id).get({ query: { locale: params.locale } }),
  });
}
