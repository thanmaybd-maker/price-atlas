import { expect, it } from 'vitest';
import { gstRate, landedCost } from '../packages/domain/landed-cost';
import type { Offer } from '../packages/domain/index';

const offer = (o: Partial<Offer>): Offer =>
  ({
    id: 'x',
    productId: 'p',
    store: 'Amazon',
    itemPrice: 4799900,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: 0,
    validUntil: 0,
    historyAllowed: true,
    alertsAllowed: true,
    displayAllowed: true,
    seller: '',
    context: '',
    ...o,
  }) as Offer;

it('shows GST as the part of a GST-inclusive price, never added on top', () => {
  const c = landedCost(offer({ itemPrice: 11800 }), 'laptops');
  expect(c.gstRate).toBe(18);
  expect(c.gstPaise).toBe(1800); // ₹118 includes ₹18 GST
  expect(c.totalPaise).toBeNull(); // Amazon under ₹499: fee unknown
});
it('uses store delivery rules and the page shipping when known', () => {
  expect(landedCost(offer({ itemPrice: 60000 }), 'laptops')).toMatchObject({
    deliveryPaise: 0,
    totalPaise: 60000,
  });
  expect(landedCost(offer({ itemPrice: 20000 }), 'laptops')).toMatchObject({
    deliveryPaise: null,
    totalPaise: null,
  });
  expect(landedCost(offer({ store: 'Nykaa', itemPrice: 25000 }), 'beauty')).toMatchObject({
    deliveryPaise: 7000,
    totalPaise: 32000,
  });
  expect(
    landedCost(
      offer({ store: 'Flipkart', shipping: 4000, charges: 1000, itemPrice: 30000 }),
      'audio',
    ),
  ).toMatchObject({ deliveryPaise: 4000, totalPaise: 35000 });
});
it('has category GST slabs', () => {
  expect(gstRate('books', 50000)).toBe(0);
  expect(gstRate('fashion', 200000)).toBe(5);
  expect(gstRate('fashion', 300000)).toBe(18);
});
