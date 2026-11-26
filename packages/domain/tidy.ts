// Display clean-up for retailer-supplied product names and brands. Store <title> tags
// often wrap the name in marketing text ("Buy X Online from Flipkart.com", "X - Buy X Online
// at Best Prices in India - Sports & Fitness | Flipkart.com"), and imports without a brand
// field show "Unknown brand" even when the name starts with it.
import type { Product } from './index';

export function tidyName(name: string) {
  let n = name.replace(/\s+/g, ' ').trim();
  // "X - Buy X Online at Best Prices in India - ... | Flipkart.com" keeps the first part.
  n = n.replace(/\s+-\s+Buy\s.+$/i, '');
  n = n.replace(/\s*[|–-]\s*(?:Flipkart\.com|Amazon\.in|Nykaa|Myntra|AJIO|Croma|Meesho)\s*$/i, '');
  n = n.replace(
    /\s+(?:Online\s+)?(?:at\s+Best\s+Prices?\s+in\s+India|Online)\s+(?:from|on|at)\s+\S+\.(?:com|in)$/i,
    '',
  );
  n = n.replace(/\s+Online\s+(?:from|on|at)\s+\S+\.(?:com|in)$/i, '');
  n = n.replace(/^Buy\s+(?=\S)/i, '');
  return n.trim() || name;
}

const KNOWN =
  /^(?:sony|apple|samsung|oneplus|xiaomi|redmi|motorola|lenovo|asus|acer|dell|hp|msi|boat|jbl|realme|vivo|oppo|google|nothing|philips|lg|canon|nikon|logitech|zotac|gigabyte|foxtale|cetaphil|lakme|maybelline|nivea|minimalist|noise|bose|sennheiser|revlon|mamaearth|pilgrim|biotique|innisfree|cosrx|laneige|bioderma|eucerin|simple|morphe|renee|mars|nykaa|himalaya|casio|kaweco|milton|prestige|bajaj|crompton|pigeon|bosch|ibell|agaro|woscher|starq|resqtech|dylect|tenda|anchor|nvidia|inno3d|pny|saregama|titan|fossil|inlife|nutrela|offer99|doxwo|burox|jtp|sagaft|nilesawar|shamsa|snowbuds|storio|miniexplorer|casotec|dizoro|soulwit|tonymoly|clayco|asaya|isdin|embryolisse|lovetc|staze|enn|vilvah|tombow|leuchtturm1917|scriveiner|anupam|ucravo|kumb144|fanttik|turbowash|kumkum|texum|karcher|kärcher|sylvania|hiniso|eversolo|sugar|etude|o3\+|cult|iftex|vellfire)$/i;
// Brands whose name is more than one word, checked against the start of the product name.
const MULTI_WORD = [
  'Fire-Boltt',
  'FireBoltt',
  'Swiss Beauty',
  'Colors Queen',
  'Faces Canada',
  'Insight Cosmetics',
  'Blue Heaven',
  'Kay Beauty',
  "L'Oreal Paris",
  'Just Herbs',
  'The Ordinary',
  'Beauty of Joseon',
  'The Pink Foundry',
  'Aroma Magic',
  'Charlotte Tilbury',
  'Rare Beauty',
  'Elle 18',
  'Mila Beauté',
  'TEE ESS',
  'Love Earth',
  'Nykaa Cosmetics',
  'M.A.C',
  'e.l.f.',
  'Amazon Basics',
  'Carbamide Forte',
  "Vlado's Himalayan Organics",
  'Wellbeing Nutrition',
  'Shakti Technology',
  'TP-Link',
  'uni-ball',
  'Shuttle Art',
  'Sun Mun Decors',
  'Tayhaa',
  'Health Veda Organics',
  "Re'equil",
];
const MULTI = new RegExp(
  `^(${MULTI_WORD.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=[\\s,:'’-]|$)`,
  'i',
);

export function tidyBrand(brand: string, name: string) {
  if (brand && !/^unknown brand$/i.test(brand)) return brand;
  const tidy = tidyName(name);
  const multi = tidy.match(MULTI)?.[1];
  if (multi) return MULTI_WORD.find((b) => b.toLowerCase() === multi.toLowerCase()) || multi;
  const first = tidy.split(/\s+/)[0] || '';
  if (!KNOWN.test(first)) return brand;
  return first.length <= 3
    ? first.toUpperCase()
    : first[0].toUpperCase() + first.slice(1).toLowerCase();
}

export function tidyProduct<T extends Pick<Product, 'name' | 'brand'>>(p: T): T {
  const name = tidyName(p.name);
  return { ...p, name, brand: tidyBrand(p.brand, name) };
}
