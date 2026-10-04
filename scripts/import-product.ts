import 'dotenv/config';
import { scrapeProduct } from '../packages/providers/scraper';
import { reserveSource } from '../packages/jobs/index';
import { parseRetailUrl } from '../packages/domain/index';
import { importScraped, postgres } from '../packages/database/postgres';
import { randomUUID } from 'node:crypto';
try {
  const url = process.argv[2];
  if (!url) throw new Error('Usage: pnpm scrape:import <retailer URL>');
  await reserveSource(parseRetailUrl(url).store);
  const result = await importScraped(await scrapeProduct(url), `operator-import-${randomUUID()}`);
  console.log(
    JSON.stringify({
      productId: result.productId,
      path: `/p/${result.product?.slug}`,
      observations: result.observations,
      quarantined: !!result.quarantined,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Import failed.');
  process.exitCode = 1;
} finally {
  await postgres().end();
}
