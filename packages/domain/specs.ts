// Specifications a shopper can read, taken from what the store page itself listed.
// Internal bookkeeping keys are never shown as product facts.
const INTERNAL = new Set(
  [
    'Verification status',
    'Fetch method',
    'Source category',
    'Source price',
    'Source currency',
    'Price note',
    'Base product ID',
    'Product URL',
    'Retailer',
    'Seller',
    'ISBN',
  ].map((k) => k.toLowerCase()),
);

export function publicSpecs(attributes: Record<string, string> = {}) {
  return Object.entries(attributes).filter(
    ([key, value]) =>
      !INTERNAL.has(key.toLowerCase()) &&
      typeof value === 'string' &&
      value.trim() !== '' &&
      value.length <= 200 &&
      key.length <= 60 &&
      !/^https?:\/\//i.test(value),
  );
}
