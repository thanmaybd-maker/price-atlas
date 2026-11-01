import { it, expect } from 'vitest';
import { retailerSearchHint } from '../packages/domain/retailer-search-hint';
it('keeps model, capacity and colour tokens when recovering a blocked listing by name', () => {
  expect(
    retailerSearchHint('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4'),
  ).toBe('apple iphone 15 black 128 gb');
  expect(
    retailerSearchHint('https://www.nykaa.com/cetaphil-gentle-cleanser-125ml/p/123?skuId=123'),
  ).toBe('cetaphil gentle cleanser 125ml');
});
it('does not turn arbitrary hosts, ASINs or category addresses into product facts', () => {
  for (const input of [
    'https://evil.example/apple-iphone-15/p/123',
    'https://www.amazon.in/dp/B09XS7JWHH',
    'https://www.nykaa.com/skin-care/c/4',
    'not a url',
  ])
    expect(retailerSearchHint(input)).toBeNull();
});
