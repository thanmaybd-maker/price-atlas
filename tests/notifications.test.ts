import { it, expect } from 'vitest';
import { unsubscribeToken, verifyUnsubscribe, alertText } from '../packages/notifications/index';
const id = '00000000-0000-4000-8000-000000000001';
it('authenticates unsubscribe links and rejects expiry/tampering', () => {
  process.env.UNSUBSCRIBE_SECRET = 'a-test-secret-with-at-least-32-characters';
  const token = unsubscribeToken(id, 2000000000000);
  expect(verifyUnsubscribe(token, 1900000000000)).toBe(id);
  expect(verifyUnsubscribe(token, 2100000000000)).toBeNull();
  expect(
    verifyUnsubscribe(token.replace('000000000001', '000000000002'), 1900000000000),
  ).toBeNull();
});
it('renders immutable factual price context without HTML interpolation', () => {
  process.env.APP_ORIGIN = 'https://atlas.example';
  process.env.UNSUBSCRIBE_SECRET = 'a-test-secret-with-at-least-32-characters';
  const message = {
    id: 'event',
    eventKey: 'episode',
    userId: id,
    email: 'test@example.com',
    productId: 'product',
    title: 'Target met',
    price: 2500000,
    target: 2600000,
    store: 'Amazon',
    observedAt: 1780000000000,
    createdAt: 1780000000000,
  };
  expect(alertText(message)).toContain('₹25,000');
  expect(alertText(message)).toContain('delivery context');
  expect(alertText(message)).toBe(alertText(message));
});
