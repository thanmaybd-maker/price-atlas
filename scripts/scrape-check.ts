import 'dotenv/config';
import { scrapeProduct, ScrapeError } from '../packages/providers/scraper';
const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm scrape:check <direct HTTPS retailer product URL>');
  process.exitCode = 1;
} else
  try {
    const result = await scrapeProduct(url);
    console.log(
      JSON.stringify(
        {
          store: result.store,
          externalId: result.externalId,
          title: result.title,
          itemPricePaise: result.itemPrice,
          shippingPaise: result.shipping,
          stock: result.stock,
          condition: result.condition,
          hasImage: !!result.imageUrl,
          attributes: Object.keys(result.attributes),
          observedAt: result.observedAt,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        error instanceof ScrapeError
          ? { code: error.code, message: error.message }
          : { code: 'invalid_link', message: 'Provide a supported direct product URL.' },
      ),
    );
    process.exitCode = 1;
  }
