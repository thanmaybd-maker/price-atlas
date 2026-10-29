import { exactMatch, type Category } from '../domain/index';
import { compareVariants, variantSignature } from '../domain/variant-guard';
export const categoryRegistry: Record<Category, string[]> = {
  phones: ['Brand', 'Model Number', 'RAM', 'Storage', 'Color', 'Connectivity'],
  laptops: ['Brand', 'Model Number', 'Processor', 'RAM', 'Storage', 'Graphics', 'Display', 'Color'],
  tablets: ['Brand', 'Model Number', 'RAM', 'Storage', 'Connectivity', 'Color'],
  audio: ['Brand', 'Model Number', 'Color', 'Connectivity'],
  monitors: ['Brand', 'Model Number', 'Display', 'Resolution', 'Refresh Rate'],
  other: ['Brand', 'GTIN', 'Condition', 'Pack', 'Size', 'Color'],
  beauty: ['Brand', 'GTIN', 'Shade', 'Size', 'Condition'],
  'personal-care': ['Brand', 'GTIN', 'Size', 'Pack', 'Condition'],
  'home-kitchen': ['Brand', 'GTIN', 'Size', 'Pack', 'Color', 'Condition'],
  appliances: ['Brand', 'Model Number', 'Color', 'Condition'],
  accessories: ['Brand', 'Model Number', 'Color', 'Connectivity', 'Condition'],
  fashion: ['Brand', 'GTIN', 'Color', 'Size', 'Pack', 'Condition'],
  books: ['GTIN', 'Edition', 'Language', 'Binding', 'Condition'],
  stationery: ['Brand', 'Model Number', 'Pack', 'Color', 'Condition'],
  services: ['Brand', 'GTIN', 'Condition'],
};
const aliases: Record<string, string> = {
  'brand name': 'Brand',
  brand: 'Brand',
  manufacturer: 'Brand',
  'model number': 'Model Number',
  'model id': 'Model Number',
  'item model number': 'Model Number',
  model: 'Model Number',
  'model name': 'Model Name',
  colour: 'Color',
  color: 'Color',
  'ram memory installed size': 'RAM',
  'memory storage capacity': 'Storage',
  'internal storage': 'Storage',
  'storage capacity': 'Storage',
  'ram capacity': 'RAM',
  ram: 'RAM',
  'ssd capacity': 'Storage',
  'hard disk size': 'Storage',
  'processor name': 'Processor',
  'processor type': 'Processor',
  'cpu model': 'Processor',
  'graphic processor': 'Graphics',
  'graphics card description': 'Graphics',
  'screen resolution': 'Resolution',
  'connectivity technology': 'Connectivity',
  'screen size': 'Display',
  'display size': 'Display',
  'refresh rate': 'Refresh Rate',
  resolution: 'Resolution',
};
export function normalizedAttributes(input: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input))
    out[aliases[key.toLowerCase().trim()] || key] = value.replace(/[‎‏]/g, '').trim();
  return out;
}
export function compareAttributes(
  category: Category,
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const first = normalizedAttributes(a),
    second = normalizedAttributes(b);
  const variants = compareVariants(variantSignature('', first), variantSignature('', second));
  if (variants.decision !== 'accepted') return variants;
  // Apple retail part numbers encode the exact storage/color/regional SKU.
  // RAM is not consistently disclosed on Apple's iPhone retailer pages.
  const applePart =
    category === 'phones' &&
    /^apple$/i.test(first.Brand || '') &&
    /^apple$/i.test(second.Brand || '') &&
    /^[A-Z0-9]{5}[A-Z]{2}\/A$/i.test(first['Model Number'] || '') &&
    /^[A-Z0-9]{5}[A-Z]{2}\/A$/i.test(second['Model Number'] || '');
  return exactMatch(
    first,
    second,
    applePart ? ['Brand', 'Model Number', 'Storage', 'Color'] : categoryRegistry[category],
  );
}
export function categoryFor(title: string, attributes: Record<string, string>): Category {
  if (/\b(?:extended warranty|warranty plan|insurance|protection plan)\b/i.test(title))
    return 'services';
  // Compatibility and bundle text describes secondary products. Classify the
  // main item first: an iPhone that works with AirPods is still a phone, and a
  // tablet bundled with a keyboard is still a tablet.
  const primary = title.split(/\b(?:with|for|compatible|works|in box|including)\b|[|;]/i)[0];
  if (
    /\b(?:mouse|keyboard|webcam|printer|router|power bank|cable|charger|adapter|case|cover|screen protector|tempered glass|earpads|sleeve|phone holder)\b/i.test(
      primary,
    )
  )
    return 'accessories';
  const devices: [Category, RegExp][] = [
    ['laptops', /\b(?:laptop|notebook|macbook)\b/i],
    [
      'tablets',
      /\b(?:tablet|ipad|galaxy tab|(?:motorola|redmi|oneplus|xiaomi) pad|lenovo tab|pad\s+\d+)\b/i,
    ],
    [
      'audio',
      /\b(?:headphones?|earbuds?|ear\s?buds?|earphones?|headset|airpods|airdopes|galaxy buds|(?:wh|wf)-[a-z0-9-]+)\b/i,
    ],
    ['monitors', /\bmonitor\b/i],
    [
      'phones',
      /\b(?:smartphone|iphone|pixel\s?\d+\w*|mobile phone|galaxy\s+(?!tab|buds|watch)|oneplus\s+(?!pad|buds)|redmi\s+(?!pad)|motorola\s+(?!pad))\b/i,
    ],
  ];
  const matches = devices
    .map(([category, pattern]) => ({ category, index: primary.search(pattern) }))
    .filter((m) => m.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (matches[0]) return matches[0].category;
  // Some retailer titles put the noun after a bundle description.
  if (/\b(?:gaming tablet|tablet)\b/i.test(title) && /\b(?:ram|rom|wi-fi)\b/i.test(title))
    return 'tablets';
  if (/\bmonitor\b/i.test(title) && /\b(?:ips|panel|inch|resolution|hz)\b/i.test(title))
    return 'monitors';
  const sourceCategory = attributes['Source category'] || '';
  if (/\b(?:makeup|lips|lipstick|cosmetics|nails|eye makeup)\b/i.test(sourceCategory))
    return 'beauty';
  if (/\b(?:skin|skin care|skincare|hair|hair care|bath|body|fragrance)\b/i.test(sourceCategory))
    return 'personal-care';
  if (
    /\b(?:lipstick|lip gloss|lip tint|lip liner|foundation|concealer|mascara|eyeliner|eyeshadow|blush|makeup|cosmetics|nail polish|nail lacquer|kajal|compact powder)\b/i.test(
      title,
    )
  )
    return 'beauty';
  if (
    /\b(?:cream|moisturi[sz]er|sunscreen|cleanser|face wash|facewash|serum|shampoo|conditioner|hair oil|body wash|lotion|skin care|skincare|hair care|lip balm|perfume|fragrance|deodorant|toothpaste)\b/i.test(
      title,
    )
  )
    return 'personal-care';
  if (
    /\b(?:kettle|cooktop|cook top|induction|dry iron|steam iron|iron press|mixer|grinder|blender|toaster|refrigerator|washing machine|air conditioner|air fryer|microwave|vacuum cleaner)\b/i.test(
      title,
    )
  )
    return 'appliances';
  if (
    /\b(?:water bottle|flask|cookware|cooker|tandoor|barbeque|griller|dinner set|pan|utensil|kitchen|bedsheet|pillow|curtain|furniture)\b/i.test(
      title,
    )
  )
    return 'home-kitchen';
  if (
    /\b(?:t[ -]?shirt|shirt|kurta|saree|sari|dress|jeans|trousers|shoes|sneakers|sandals|handbag|clothing|apparel)\b/i.test(
      title,
    )
  )
    return 'fashion';
  if (
    /\b(?:calculator|fx-?\d{3}[a-z]+|notebook paper|ball ?pen|fountain pen|pencil|stationery|marker pen)\b/i.test(
      title,
    )
  )
    return 'stationery';
  if (
    /\b(?:book|novel|paperback|hardcover|hardback|\d+(?:st|nd|rd|th) edition)\b/i.test(title) ||
    Object.keys(attributes).some((k) => /^(?:ISBN(?:[- ]?1[03])?|Author|Publisher)$/i.test(k)) ||
    /^97[89]\d{10}$/.test(attributes.GTIN || '')
  )
    return 'books';
  return 'other';
}
