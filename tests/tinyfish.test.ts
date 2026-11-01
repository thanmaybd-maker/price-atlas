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

import { parseTinyFishSearch } from '../packages/providers/tinyfish';
it('reads product links and titles from a retailer search page in order', () => {
  const out = parseTinyFishSearch(
    'Amazon',
    '## PNY GeForce RTX 5090 Epic-X\n\n₹15,34,285\n\n## NVD GeForce RTX 5090 Windforce\n\n₹7,48,888',
    [
      'https://www.amazon.in/PNY-GeForce/dp/B0DTJFSSZG/ref=sr_1_1?x=1',
      'https://www.amazon.in/PNY-GeForce/dp/B0DTJFSSZG/ref=sr_1_1?x=1#customerReviews',
      'https://www.amazon.in/GeForce-Windforce/dp/B0GMRSMNGB/ref=sr_1_6',
      'https://www.flipkart.com/x/p/itm1?pid=AAAAAAAAAAAAAAAA',
    ],
  );
  expect(out).toEqual([
    {
      title: 'PNY GeForce RTX 5090 Epic-X',
      url: 'https://www.amazon.in/dp/B0DTJFSSZG',
      store: 'Amazon',
    },
    {
      title: 'NVD GeForce RTX 5090 Windforce',
      url: 'https://www.amazon.in/dp/B0GMRSMNGB',
      store: 'Amazon',
    },
  ]);
});

import { amazonSearchCards } from '../packages/providers/tinyfish';
describe('Amazon search cards', () => {
  it('reads each priced card on its own and skips unpriced ones', () => {
    const html = `
      <div data-component-type="s-search-result" data-asin="B0BZP2H373">
        <h2>Sony</h2><h2>WH-1000XM5 Wireless Headphones - Blue</h2>
        <img class="s-image" src="https://m.media-amazon.com/images/I/a.jpg">
        <span class="a-price"><span class="a-offscreen">₹19,989</span></span>
        <span class="a-price a-text-price"><span class="a-offscreen">₹34,990</span></span>
      </div>
      <div data-component-type="s-search-result" data-asin="B0C33XXS56">
        <h2>Sony WF-1000XM5 Earbuds</h2>
      </div>`;
    const cards = amazonSearchCards(html, 1);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      externalId: 'B0BZP2H373',
      title: 'Sony WH-1000XM5 Wireless Headphones - Blue',
      itemPrice: 1998900,
      stock: true,
      imageUrl: 'https://m.media-amazon.com/images/I/a.jpg',
    });
  });
});
