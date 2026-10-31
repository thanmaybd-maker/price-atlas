import { expect, it } from 'vitest';
import { trackersFor } from '../apps/web/components/external-history';
it('deep-links the right free trackers for each store', () => {
  expect(trackersFor('https://www.amazon.in/dp/b0gr16t68f').map((t) => t.name)).toEqual([
    'Keepa',
    'BuyHatke',
    'PriceBefore',
  ]);
  expect(trackersFor('https://www.amazon.in/dp/B0GR16T68F')[0].href).toBe(
    'https://keepa.com/#!product/10-B0GR16T68F',
  );
  expect(trackersFor('https://www.nykaa.com/x/p/1').map((t) => t.name)).toEqual(['BuyHatke']);
  expect(trackersFor('https://www.croma.com/x/p/1')).toEqual([]);
  expect(trackersFor(undefined)).toEqual([]);
});
