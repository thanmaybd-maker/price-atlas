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

import { categoryFor as categoryForLaptop } from '../packages/matching/index';
import { it as itLaptop, expect as expectLaptop } from 'vitest';
itLaptop('files laptops from phone brands and suffix nouns as laptops', () => {
  expectLaptop(
    categoryForLaptop(
      'MOTOROLA Motobook 60 Full Metal WUXGA OLED Intel Core 5 210H - (16 GB/512 GB SSD/Windows 11 Home) 14IRH10R Thin and Light Laptop',
      {},
    ),
  ).toBe('laptops');
  expectLaptop(
    categoryForLaptop('ASUS ExpertBook P1 with 1 Yr ADP Intel Core 5 210H (16 GB/512 GB SSD)', {}),
  ).toBe('laptops');
  expectLaptop(categoryForLaptop('Motorola Edge 50 Fusion 5G (8GB RAM, 256GB)', {})).toBe('phones');
});
it('puts each shelf item where a shopper would look for it', () => {
  const cases: [string, string, Record<string, string>?][] = [
    [
      'Fire-Boltt Ninja Call Pro Plus Bluetooth Calling Smart Watch, 1.83" Display, AI Voice Assistant, 120+ Sports Modes, SpO2 & Heart Rate Monitor',
      'wearables',
    ],
    [
      'Noise Twist Round dial Smart Watch with Bluetooth Calling, 1.38" TFT Display, Sleep Tracking (Blush Beige)',
      'wearables',
    ],
    ['Fire-Boltt Ninja Calling Pro Plus 46.5mm (1.83) Display Bluetooth... more', 'wearables'],
    ['Charlotte Tilbury Matte Revolution - Pillow Talk Medium(3.5g)', 'beauty'],
    [
      'HP Smart Tank 524 All-in-One Colour Printer |1+1 Year Extended Warranty on Registration| Up to 4000 Black & 6000 Colour Prints',
      'accessories',
    ],
    ['Lenovo 2years Extended Warranty with Onsite Service (for Entry Laptops)', 'services'],
    [
      'HP Care Pack 2 Years Additional Warranty with Onsite Support for 14 15 Series Laptops',
      'services',
    ],
    [
      'BOSCH Universal Aquatak 130 High-Pressure Washer | 1700W Motor | 130 Bar, 3-in-1 Nozzle',
      'appliances',
    ],
    [
      'OnePlus Nord Buds 3r TWS Earbuds up to 54 Hours Playback, 2-mic Clear Calls, 3D Spatial Audio',
      'audio',
    ],
    ['boAt Nirvana Iris Bluetooth', 'audio'],
    ['KUMB144 SnapX 20 Buds With Touch Sensor, Waterproof, ANC, Bluetooth V5.3 Bluetooth', 'audio'],
    ['OnePlus Nord 6 | 8GB+256GB | Pitch Black | Snapdragon 8s Gen 4', 'phones'],
    ['Xiaomi 17 Ultra (Black 16GB+512GB) |Free Photography Kit', 'phones'],
    ['Educational Kids Laptop Learning Toy for 2-5 Years Boys Girls', 'other'],
    ['Lenovo Intel Core Ultra 9 275HX - (32 GB/1 TB SSD/Windows 11 Home... more', 'laptops'],
    [
      'Lenovo Legion 7 Intel Core Ultra 9 275HX - (32 GB/1 TB SSD/Windows 11 Home/8 GB Graphics/NVIDIA GeForce RTX 5070) 16IAX10 Gaming Laptop',
      'laptops',
    ],
    ['ASUS Prime GeForce RTX 5070 12GB GDDR7 OC Edition Gaming Graphics Card', 'accessories'],
    ['TP-Link LS1008 8-Port 10/100Mbps Fast Ethernet Unmanaged Desktop Switch', 'accessories'],
    ['Samsung 60.96 cm (24 Inch) Quad HD IPS Panel with Height Adjustab... more', 'monitors'],
    ["Titan Karishma Analog Black Dial Men's Watch -NM1639SM02", 'fashion'],
    ['Kay Beauty FullFill Tinted Lip Plumping Gloss - Gimme Roses(5g)', 'beauty'],
    ['Inde Wild Dewy Lip Balms - Transparent(15ml)', 'personal-care'],
    ['Innisfree Super Volcanic Pore Clay Mask 2X For Clogged Pores', 'personal-care'],
    ['Tayhaa White & Gold Piano Player Showpiece(One Size)', 'home-kitchen'],
    ['uni-ball Air UBA188M 0.5mm Roller Ball Pen | Blue Ink, Pack of 3', 'stationery'],
    ['Rina Kent Legacy of Gods Series 6 Books Collection Set', 'books'],
  ];
  for (const [title, category, attributes] of cases)
    expect([title, categoryFor(title, attributes || {})]).toEqual([title, category]);
});
