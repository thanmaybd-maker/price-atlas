import { it, expect } from 'vitest';
import { categoryFor } from '../packages/matching/index';
import { isIsbn13 } from '../packages/domain/isbn';
it('classifies the main device before compatibility and bundled accessories', () => {
  expect(
    categoryFor(
      'Apple iPhone 16 Pro 128 GB: 5G Mobile Phone. Works with AirPods; Black Titanium',
      {},
    ),
  ).toBe('phones');
  expect(
    categoryFor(
      'MOTOROLA Pad 70 Pro In box Moto active stylus + Magnetic Keyboard Case 8 GB RAM Gaming Tablet',
      {},
    ),
  ).toBe('tablets');
  expect(categoryFor('Apple MacBook Air Laptop with iPhone and iPad support', {})).toBe('laptops');
  expect(categoryFor('Sony Wireless Headphones for iPhone and laptop', {})).toBe('audio');
  expect(
    categoryFor(
      'Samsung Quad HD IPS Panel with Height Adjustable Stand, Inbuilt Speakers Monitor',
      {},
    ),
  ).toBe('monitors');
  expect(categoryFor('Apple iPhone 16 Silicone Case', {})).toBe('accessories');
  expect(categoryFor('Apple AirPods Pro with Charging Case', {})).toBe('audio');
});
it('gives general products their own main categories', () => {
  for (const [name, category] of [
    ['Nykaa Creamy Matte Lipstick', 'beauty'],
    ['Maybelline Foundation', 'beauty'],
    ['Cetaphil Relief Cream', 'personal-care'],
    ['Minimalist Face Serum', 'personal-care'],
    ['Logitech M331 Mouse', 'accessories'],
    ['Prestige Electric Kettle', 'appliances'],
    ['Milton Water Bottle', 'home-kitchen'],
    ['Cotton Tshirt', 'fashion'],
    ['Casio Scientific Calculator', 'stationery'],
    ['Atomic Habits Paperback', 'books'],
    ['Extended Warranty Plan for Headphones', 'services'],
  ])
    expect(categoryFor(name, {}), name).toBe(category);
  expect(categoryFor('Atomic Habits', { GTIN: '9789390085255' })).toBe('books');
  expect(isIsbn13('9789390085255')).toBe(true);
  expect(isIsbn13('9789390085256')).toBe(false);
});
