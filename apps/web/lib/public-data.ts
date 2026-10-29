import * as data from '@database/runtime';
import { createReadCache } from './public-cache';
const cache = createReadCache();
export const publicCatalog = () =>
  cache.read('catalog', async () => {
    const [products, offers] = await Promise.all([data.catalog(), data.offers()]);
    return { products, offers };
  });
export const publicHistory = (ids: string[], days: number) =>
  cache.read(`history:${days}:${ids.join(',')}`, () => data.historyOverview(ids, days));
