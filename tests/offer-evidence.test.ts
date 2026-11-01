import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfferEvidence } from '../apps/web/components/offer-evidence';
import type { Offer } from '../packages/domain/index';
const base: Offer = {
  id: 'proof',
  productId: 'p',
  store: 'Amazon',
  itemPrice: 10000,
  shipping: null,
  charges: 0,
  discount: 0,
  currency: 'INR',
  stock: true,
  accepted: true,
  condition: 'new',
  observedAt: Date.now() - 1000,
  validUntil: Date.now() + 60000,
  historyAllowed: true,
  alertsAllowed: true,
  displayAllowed: true,
  seller: 's',
  context: 'default',
};
it('does not label a stale or rejected observation as verified', () => {
  for (const offer of [
    { ...base, validUntil: 0 },
    { ...base, accepted: false },
  ]) {
    const markup = renderToStaticMarkup(createElement(OfferEvidence, { offer, basis: 'item' }));
    expect(markup).not.toContain('✓ Verified');
    expect(markup).toContain('verify on store');
  }
});
it('keeps native currency in source evidence and uses a shopper-facing disclosure name', () => {
  const markup = renderToStaticMarkup(
    createElement(OfferEvidence, {
      offer: { ...base, currency: 'USD', store: 'B&H' },
      basis: 'item',
    }),
  );
  expect(markup).toContain('USD');
  expect(markup).not.toContain('• INR');
  expect(markup).toContain('Price source and verification');
});
