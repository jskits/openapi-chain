import type { Catalog, DetailInput } from './api.js';
import { catalogDetail } from './query.js';

export function catalogSWR(api: Catalog, cacheScope: string) {
  const detail = catalogDetail(api, cacheScope);
  return (input: DetailInput | null) => detail.swr(input);
}
