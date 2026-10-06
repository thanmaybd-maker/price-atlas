import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { scrapeProduct, canonicalRetailUrl, ScrapeError } from '../packages/providers/scraper';
import { reserveSource } from '../packages/jobs/index';
import { importScraped, postgres } from '../packages/database/postgres';
const urls = [
  'https://www.flipkart.com/apple-airpods-pro-2nd-generation-magsafe-case-usb-c-bluetooth/p/itm60c8f5a308352',
  'https://www.flipkart.com/apple-macbook-air-m2-16-gb-256-gb-ssd-macos-sequoia-mc7x4hn-a/p/itm85610764432a1',
  'https://www.amazon.in/dp/B09XS7JWHH',
  'https://www.flipkart.com/sony-wh-1000xm5-wireless-noise-cancellation-ai-reduction-bluetooth/p/itm7f07dcc8df256',
  'https://www.amazon.in/dp/B0DLHFM2XL',
  'https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itmb07d67f995271',
  'https://www.amazon.in/dp/B0DXQH1DBS',
  'https://www.flipkart.com/apple-ipad-air-m2-128-gb-rom-11-0-inch-wi-fi-5g-blue/p/itmc145452a9d0a1',
  'https://www.amazon.in/dp/B0DGJ7X1DX',
  'https://www.flipkart.com/samsung-s24-5g-onyx-black-256-gb/p/itm0456c01739016',
  'https://www.amazon.in/dp/B0CHXCR9CX',
  'https://www.flipkart.com/sony-wf-c700n-lightest-tws-anc-20hr-battery-in-ear-10-min-quick-charge-multi-point-bluetooth-headset/p/itm0cd6a3c79152a',
  'https://www.amazon.in/dp/B0CR44MHBD',
  'https://www.flipkart.com/google-pixel-9-wintergreen-256-gb/p/itmcead5185c21a8',
  'https://www.amazon.in/dp/B0DHL6GDHQ',
  'https://www.amazon.in/dp/B0DZ78F2CT',
  'https://www.amazon.in/dp/B0DZDDQ429',
  'https://www.amazon.in/dp/B0CZ3ZPD8B',
];
const last = new Map<string, number>();
try {
  for (const url of urls) {
    const { store } = canonicalRetailUrl(url);
    await sleep(Math.max(0, 31000 - (Date.now() - (last.get(store) || 0))));
    try {
      await reserveSource(store);
      last.set(store, Date.now());
      const scraped = await scrapeProduct(url);
      const result = await importScraped(scraped, `catalog-${randomUUID()}`);
      console.log(
        JSON.stringify({
          store,
          title: scraped.title,
          productId: result.productId,
          price: scraped.itemPrice,
          stock: scraped.stock,
          observations: result.observations,
          attributes: scraped.attributes,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          store,
          url,
          error:
            error instanceof ScrapeError
              ? error.code
              : String((error as { code?: string }).code || 'import_failed'),
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      event: 'catalog_complete',
      counts: (
        await postgres().query(
          'SELECT (SELECT count(*) FROM atlas.products) products,(SELECT count(*) FROM atlas.listings) listings,(SELECT count(*) FROM atlas.observations) observations',
        )
      ).rows[0],
    }),
  );
} finally {
  await postgres().end();
}
