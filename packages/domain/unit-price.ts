// Price per 100 ml or 100 g (per 10 for small packs), so a 200 ml bottle and a 100 ml bottle
// can be compared at a glance. Only for shelves sold by volume or weight: a laptop's weight
// is not what you pay for.
import type { Category } from './index';
import { variantSignature } from './variant-guard';

const BY_QUANTITY: Category[] = ['beauty', 'personal-care', 'home-kitchen', 'other'];
const QUANTITY_TOKEN =
  /\b\d+(?:\.\d+)?\s*(?:mls?|millilitres?|milliliters?|litres?|liters?|ltrs?|l|kgs?|kilograms?|grams?|gms?|g)\b/gi;

export function unitPrice(
  title: string,
  attributes: Record<string, string>,
  paise: number | null | undefined,
  category: Category,
): { paise: number; per: string } | null {
  if (paise == null || paise <= 0 || !BY_QUANTITY.includes(category)) return null;
  const signature = variantSignature(title, attributes);
  // Combos, kits and multi-item bundles mix different products, so dividing by one item's
  // size would invent a bogus unit price.
  if (signature.bundle) return null;
  const distinctTitleSizes = new Set(
    (title.match(QUANTITY_TOKEN) || []).map((t) => t.toLowerCase().replace(/\s+/g, '')),
  );
  if (distinctTitleSizes.size > 1) return null;
  const match = signature.volumeOrWeight?.match(/^(\d+(?:\.\d+)?)(ml|g)$/);
  if (!match) return null;
  const amount =
    Number(match[1]) * (signature.packCount && signature.packCount > 1 ? signature.packCount : 1);
  if (!(amount > 0)) return null;
  const step = amount < 50 ? 10 : 100;
  return { paise: Math.round((paise / amount) * step), per: `${step} ${match[2]}` };
}
