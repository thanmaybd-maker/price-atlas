import { exactMatch, type Category } from '../domain/index';
export const categoryRegistry: Record<Category, string[]> = {
  phones: ['Brand', 'Model Number', 'RAM', 'Storage', 'Color', 'Connectivity'],
  laptops: ['Brand', 'Model Number', 'Processor', 'RAM', 'Storage', 'Graphics', 'Display', 'Color'],
  tablets: ['Brand', 'Model Number', 'RAM', 'Storage', 'Connectivity', 'Color'],
  audio: ['Brand', 'Model Number', 'Color', 'Connectivity'],
  monitors: ['Brand', 'Model Number', 'Display', 'Resolution', 'Refresh Rate'],
  other: ['Brand', 'GTIN', 'Condition', 'Pack', 'Size', 'Color'],
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
  const deviceAt = title.search(
    /\b(?:headphones?|earbuds?|earphones?|headset|airpods|laptop|notebook|macbook|tablet|ipad|monitor|smartphone|iphone|pixel|galaxy tab|pad\s+\d)\b/i,
  );
  const accessoryAt = title.search(
    /\b(?:mouse|keyboard|webcam|printer|router|power bank|cable|charger|adapter)\b/i,
  );
  if (accessoryAt >= 0 && (deviceAt < 0 || accessoryAt < deviceAt)) return 'other';
  if (/\b(?:extended warranty|warranty plan|insurance|protection plan)\b/i.test(title))
    return 'other';
  if (
    /\b(?:charging|data|usb|hdmi|type[- ]?c)\s+(?:[\w-]+\s+){0,4}cable\b|\b(?:screen protector|tempered glass|replacement ear(?:pads| cushions)|protective (?:case|cover)|laptop (?:stand|sleeve)|phone (?:case|cover|holder)|power adapter)\b/i.test(
      title,
    )
  )
    return 'other';
  const text = title.toLowerCase();
  if (/headphone|earbud|earphone|headset|airpods|airdopes|\b(?:wh|wf)-[a-z0-9-]+\b/.test(text))
    return 'audio';
  if (/laptop|notebook|macbook/.test(text)) return 'laptops';
  if (/tablet|ipad|galaxy tab/.test(text)) return 'tablets';
  if (/monitor/.test(text)) return 'monitors';
  if (/phone|pixel|iphone|galaxy|oneplus|redmi|mobile/.test(text)) return 'phones';
  return 'other';
}
