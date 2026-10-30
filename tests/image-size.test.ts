import { expect, it } from 'vitest';
import { sizedImage } from '../packages/domain/image-size';
it('asks retailer CDNs for card-sized images', () => {
  expect(sizedImage('https://m.media-amazon.com/images/I/71E+NLQFhgL._SL1500_.jpg', 400)).toBe(
    'https://m.media-amazon.com/images/I/71E+NLQFhgL._SL400_.jpg',
  );
  expect(sizedImage('https://m.media-amazon.com/images/I/81x._AC_SX679_.jpg', 300)).toBe(
    'https://m.media-amazon.com/images/I/81x._SL300_.jpg',
  );
  expect(sizedImage('https://rukminim2.flixcart.com/image/832/832/x/a.jpeg?q=70', 312)).toBe(
    'https://rukminim2.flixcart.com/image/312/312/x/a.jpeg?q=70',
  );
  expect(sizedImage('https://images-static.nykaa.com/media/a.jpg', 300)).toBe(
    'https://images-static.nykaa.com/media/a.jpg?tr=w-300',
  );
  expect(sizedImage('https://example.com/a.jpg', 300)).toBe('https://example.com/a.jpg');
  expect(sizedImage(undefined, 300)).toBeUndefined();
});
