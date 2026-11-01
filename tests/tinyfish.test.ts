import { describe, expect, it } from 'vitest';
import {
  fetchWithTinyFish,
  priceFromFetch,
  productFromFetch,
} from '../packages/providers/tinyfish';

// Trimmed from real TinyFish Fetch responses (1 Nov 2026).
const nykaa = {
  url: 'https://www.nykaa.com/foxtale-dewy-sunscreen/p/19331333?skuId=7828597',
  text: '# Foxtale Dewy Finish SPF 50 PA++++ Sunscreen (50ml)\n\n₹495₹39620% Off\n\nRegular price ₹495. Discounted price ₹396. 20% Off.\n\nAdd to Bag\n\nSold by :Nykaa E retail limited',
  page_metadata: { other: { 'product:price:amount': '396', 'product:price:currency': 'INR' } },
};
const flipkart = {
  url: 'https://www.flipkart.com/motorola-pad/p/itmeb47d375e3438?pid=TABHZGH3VGXPFB6S',
  text: 'Cart\n\n# MOTOROLA Pad 70 Pro 8 GB RAM 256 GB ROM ... more\n\n4.6\n\n| 298\n\n51%\n\n97,000\n\n₹47,999\n\n+₹256 Protect Promise Fee\n\nBuy at ₹43,999\n\n₹43,999\n\nLowest price for you\n\nBuy now',
};

describe('TinyFish fetch parsing', () => {
  it('uses the page price meta, then the discounted-price line', () => {
    expect(priceFromFetch(nykaa)).toBe(39600);
    expect(priceFromFetch({ ...nykaa, page_metadata: undefined })).toBe(39600);
  });
  it('takes the selling price after the title, never MRP, fees or offer prices', () => {
    expect(priceFromFetch(flipkart)).toBe(4799900);
  });
  it('builds an in-stock product and refuses an unclear page', () => {
    expect(productFromFetch(flipkart.url, flipkart)).toMatchObject({
      store: 'Flipkart',
      itemPrice: 4799900,
      stock: true,
      parserVersion: 'tinyfish-fetch-v1',
    });
    expect(
      productFromFetch(flipkart.url, { url: flipkart.url, text: '# Item\n\nSold out' }).itemPrice,
    ).toBeNull();
  });
  it('rejects a redirect to another listing', async () => {
    process.env.TINYFISH_API_KEY = 't';
    const f = (async () =>
      Response.json({
        results: [
          { ...flipkart, final_url: 'https://www.flipkart.com/other/p/itmx?pid=ZZZZZZZZZZZZZZZZ' },
        ],
      })) as typeof fetch;
    await expect(fetchWithTinyFish(flipkart.url, 1000, f)).rejects.toThrow('tinyfish_redirected');
    delete process.env.TINYFISH_API_KEY;
  });
});
