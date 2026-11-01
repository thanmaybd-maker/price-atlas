import { expect, it } from 'vitest';
import { tidyBrand, tidyName } from '../packages/domain/tidy';
it('strips store marketing text from titles', () => {
  expect(tidyName('Buy SONY ULT FIELD 3 Massive Bass Speaker Online from Flipkart.com')).toBe(
    'SONY ULT FIELD 3 Massive Bass Speaker',
  );
  expect(
    tidyName(
      'VELLFIRE 10kg vest Black Weight Vest - Buy VELLFIRE 10kg vest Black Weight Vest Online at Best Prices in India - Sports & Fitness | Flipkart.com',
    ),
  ).toBe('VELLFIRE 10kg vest Black Weight Vest');
  expect(tidyName('Sony WH-1000XM5 Headphones')).toBe('Sony WH-1000XM5 Headphones');
  expect(tidyName('Buyers Guide Book')).toBe('Buyers Guide Book');
});
it('fills an unknown brand from a known brand at the start of the name', () => {
  expect(tidyBrand('Unknown brand', 'SONY WF-C700N/BZ IN Bluetooth Headset')).toBe('Sony');
  expect(tidyBrand('Unknown brand', 'HP 15 Laptop')).toBe('HP');
  expect(tidyBrand('Unknown brand', 'Generic Cable')).toBe('Unknown brand');
  expect(tidyBrand('Zotac', 'ZOTAC RTX')).toBe('Zotac');
});
