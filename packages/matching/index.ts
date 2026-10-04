import { exactMatch, type Category } from '../domain/index';
export const categoryRegistry: Record<Category, string[]> = {
  phones: ['Brand', 'Model Number', 'RAM', 'Storage', 'Color', 'Connectivity'],
  laptops: ['Brand', 'Model Number', 'Processor', 'RAM', 'Storage', 'Graphics', 'Display', 'Color'],
  tablets: ['Brand', 'Model Number', 'RAM', 'Storage', 'Connectivity', 'Color'],
  audio: ['Brand', 'Model Number', 'Color', 'Connectivity'],
  monitors: ['Brand', 'Model Number', 'Display', 'Resolution', 'Refresh Rate'],
};
const aliases: Record<string, string> = {
  'brand name': 'Brand',
  brand: 'Brand',
  manufacturer: 'Brand',
  'model number': 'Model Number',
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
  'connectivity technology': 'Connectivity',
  'screen size': 'Display',
  'display size': 'Display',
  'refresh rate': 'Refresh Rate',
  resolution: 'Resolution',
};
export function normalizedAttributes(input: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input))
    out[aliases[key.toLowerCase().trim()] || key] = value;
  return out;
}
export function compareAttributes(
  category: Category,
  a: Record<string, string>,
  b: Record<string, string>,
) {
  return exactMatch(normalizedAttributes(a), normalizedAttributes(b), categoryRegistry[category]);
}
export function categoryFor(title: string, attributes: Record<string, string>): Category {
  const text = `${title} ${Object.values(attributes).join(' ')}`.toLowerCase();
  if (/headphone|earbud|earphone|headset/.test(text)) return 'audio';
  if (/laptop|notebook|macbook/.test(text)) return 'laptops';
  if (/tablet|ipad|galaxy tab/.test(text)) return 'tablets';
  if (/monitor/.test(text)) return 'monitors';
  if (/phone|pixel|iphone|galaxy|oneplus|redmi|mobile/.test(text)) return 'phones';
  throw new Error(
    'This product category is not supported yet. Import a phone, laptop, tablet, audio product or monitor.',
  );
}
