import { exactMatch, type Category } from '../domain/index';
import { compareVariants, variantSignature } from '../domain/variant-guard';
import { isIsbn13 } from '../domain/isbn';
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
  wearables: ['Brand', 'Model Number', 'Color', 'Size', 'Connectivity'],
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
  isbn: 'ISBN',
  'isbn-13': 'ISBN',
  'isbn 13': 'ISBN',
  isbn13: 'ISBN',
  gtin: 'GTIN',
  gtin13: 'GTIN',
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
  if (category === 'books') {
    const identities = [first, second].map((attributes) => {
      const values = [attributes.ISBN, attributes.GTIN]
        .filter(Boolean)
        .map((value) => value.replace(/[\s-]/g, ''))
        .filter(isIsbn13);
      return [...new Set(values)];
    });
    if (identities.some((values) => values.length > 1))
      return { decision: 'rejected' as const, conflicts: ['ISBN'], unknown: [] };
    if (identities.some((values) => !values.length))
      return { decision: 'review' as const, conflicts: [], unknown: ['ISBN'] };
    first.GTIN = identities[0][0];
    second.GTIN = identities[1][0];
  }
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
  // Compatibility and bundle text describes secondary products. Classify the
  // main item first: an iPhone that works with AirPods is still a phone, and a
  // tablet bundled with a keyboard is still a tablet.
  const primary = title.split(/\b(?:with|for|compatible|works|in box|including)\b|[|;]/i)[0];
  // Toys named after real devices ("Kids Laptop Learning Toy") are not devices.
  if (/\btoys?\b/i.test(title)) return 'other';
  // A computer with an SSD named a laptop anywhere in the title is a laptop, even when the
  // brand also makes phones (Motorola Motobook) or the noun sits after "with".
  if (
    /\b(?:laptop|notebook|chromebook)\b/i.test(title) &&
    /\b(?:ssd|emmc|windows 11|chrome os|macos)\b/i.test(title)
  )
    return 'laptops';
  // Flipkart laptop titles often drop the noun: "Lenovo Intel Core Ultra 9 - (32 GB/1 TB SSD/...)".
  if (
    /\b(?:intel core|core ultra|ryzen|athlon|celeron)\b/i.test(title) &&
    /\b\d+\s?(?:gb|tb)\b[^)]*\bssd\b|\bssd\b/i.test(title) &&
    !/\b(?:graphics? card|video card)\b/i.test(title)
  )
    return 'laptops';
  // A warranty plan names the warranty first. A printer that comes "| with 1+1 year extended
  // warranty" is still a printer, so only the main part of the title decides.
  if (
    /\b(?:extended warranty|additional warranty|warranty plan|care pack|insurance|protection plan)\b/i.test(
      primary,
    )
  )
    return 'services';
  if (
    /\b(?:mouse|keyboard|webcam|printer|mfp|router|power bank|mouse ?pad|cable|charger|adapter|case|cover|screen protector|tempered glass|earpads|sleeve|phone holder)\b/i.test(
      primary,
    )
  )
    return 'accessories';
  const devices: [Category, RegExp][] = [
    [
      'laptops',
      /\b(?:laptop|notebook|macbook|chromebook|expertbook|vivobook|zenbook|ideapad|thinkpad|thinkbook|motobook|inspiron|vostro|latitude|pavilion|omnibook|probook|elitebook|galaxy book\d*)\b/i,
    ],
    [
      'tablets',
      /\b(?:tablet|ipad|galaxy tab|(?:motorola|redmi|oneplus|xiaomi) pad|lenovo tab|pad\s+\d+)\b/i,
    ],
    // Watches come before monitors: "Heart Rate Monitor" in a watch title is a feature.
    [
      'wearables',
      /\b(?:smart\s?watch(?:es)?|apple watch|galaxy watch|fitness (?:band|tracker)|smart\s?band|smart ring)\b/i,
    ],
    [
      'audio',
      /\b(?:headphones?|earbuds?|ear\s?buds?|buds|earphones?|headset|neckband|tws|airpods|airdopes|rockerz|galaxy buds|(?:wh|wf|wi)-[a-z0-9-]+|(?:bluetooth|portable|party|smart) speakers?|soundbar|(?:cd|music|mp3|record) players?|turntable|music streamer|amplifier)\b/i,
    ],
    ['monitors', /\b(?<!heart rate |baby |bp |blood pressure )monitor\b/i],
    [
      'phones',
      /\b(?:smartphone|iphone|pixel\s?\d+\w*|mobile phone|galaxy\s+(?!tab|buds|watch|book)|oneplus\s+(?!pad|buds|nord buds|watch)|redmi\s+(?!pad|buds|watch)|motorola\s+(?!pad)|(?:xiaomi|vivo|oppo|realme|iqoo|poco|infinix|tecno|honor)\s+(?!buds|watch|band|pad|tab)(?:[a-z]+\s+)?\d+)\b/i,
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
  if (/\b(?:smart\s?watch|smartwatch)\b/i.test(title)) return 'wearables';
  // Flipkart often drops the noun: "Ninja Calling Pro 46.5mm (1.83) Display Bluetooth".
  if (/\bcalling\b/i.test(title) && /\bdisplay\b/i.test(title) && /\d\s?mm\b|\d"|\d″/i.test(title))
    return 'wearables';
  if (/\b(?:earbuds?|buds|tws|headphones?|airdopes|music streamer|cd player)\b/i.test(title))
    return 'audio';
  if (/\bboat\s+(?:nirvana|rockerz|airdopes|immortal|bassheads|stone)\b/i.test(title))
    return 'audio';
  if (/\bmonitor\b/i.test(title) && /\b(?:ips|panel|inch|resolution|hz)\b/i.test(title))
    return 'monitors';
  if (
    /\b(?:ips|va) panel\b/i.test(title) &&
    /\b(?:quad hd|qhd|fhd|full hd|uhd|4k|\d+\s?hz)\b/i.test(title)
  )
    return 'monitors';
  // Analog watches are fashion; smartwatches were handled above.
  if (/\b(?:analog|analogue|quartz|wrist ?watch)\b/i.test(title) && /\bwatch\b/i.test(title))
    return 'fashion';
  // Computer parts and networking gear, checked only after laptops so a laptop with a
  // GeForce GPU stays a laptop.
  if (
    /\b(?:graphics? card|video card|gpu|gddr\d\w*|dvd[- ]?(?:rw|rom|drive|writer)|cd\/dvd|\d{3,5} dpi|external (?:hdd|ssd|hard drive)|(?:ethernet|gigabit|network|desktop) switch|\d+[- ]port (?:gigabit |ethernet )?switch)\b/i.test(
      title,
    )
  )
    return 'accessories';
  const sourceCategory = attributes['Source category'] || '';
  if (/\b(?:makeup|lips|lipstick|cosmetics|nails|eye makeup)\b/i.test(sourceCategory))
    return 'beauty';
  if (/\b(?:skin|skin care|skincare|hair|hair care|bath|body|fragrance)\b/i.test(sourceCategory))
    return 'personal-care';
  // Lip care is skin care; lip colour is make-up.
  if (/\blips? (?:balms?|treatment|sleeping mask|care|scrub|mask)\b/i.test(title))
    return 'personal-care';
  if (
    /\b(?:lipsticks?|lips? ?(?:gloss|tint|liner|oil|crayon|colou?r|mousse|stain|plumper|palette|stick)|foundation|concealer|mascara|eyeliner|eye liner|eyeshadow|kohl|kajal|blush(?:er)?|bronzer|highlighter|primer|setting powder|compact powder|(?:matte|stay|powder) compact|makeup|make-up|cosmetics|gloss|nail polish|nail lacquer|brush set|makeup brush|smudger brush|clickstick)\b/i.test(
      title,
    ) ||
    // Shade names in parentheses after "matte": "Matte Revolution - Pillow Talk Medium(3.5g)".
    (/\bmatte\b/i.test(title) && /\(\s?\d+(?:\.\d+)?\s?(?:g|gm|ml)\s?\)/i.test(title))
  )
    return 'beauty';
  if (
    /\b(?:cream|cr\u00e8me|creme|moisturi[sz]e(?:r)?|sunscreen|sun (?:gel|protection|stick|spray)|spf\s?\d+|cleanser|cleansing|face ?wash|facial (?:wash|kit)|serum|toner|essence|sheet mask|face mask|clay mask|glow mask|collagen mask|hair mask|face pack|balm|hyaluronic|ceramides?|scrub|acne|pimple|retinol|niacinamide|salicylic|shampoo|conditioner|hair oil|body (?:wash|oil|lotion)|shower (?:gel|oil)|underarm|lotion|skin care|skincare|hair care|perfume|fragrance|deodorant|toothpaste)\b/i.test(
      title,
    )
  )
    return 'personal-care';
  if (
    /\b(?:kettle|cooktop|cook top|induction|dry iron|steam iron|iron press|mixer|grinder|blender|toaster|refrigerator|washing machine|air conditioner|air fryer|microwave|vacuum cleaner|pressure washer|car washer|airfryer|water purifier|geyser|room heater)\b/i.test(
      title,
    )
  )
    return 'appliances';
  if (
    /\b(?:water bottle|flask|cookware|cooker|tandoor|barbeque|griller|dinner set|pan|utensil|kitchen|bedsheet|pillows?(?! talk)|curtain|furniture|showpiece|figurine|art frame|wall art|home decor)\b/i.test(
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
    /\b(?:calculator|fx-?\d{3}[a-z]+|notebook paper|ball ?pen|roller ?ball pen|gel (?:ink )?pens?|fountain pen|pens?(?! drive)|pencil|stationery|marker pen)\b/i.test(
      title,
    )
  )
    return 'stationery';
  if (
    /\b(?:books?|novel|paperback|moral stories|stories for kids|edition by|hardcover|hardback|bestselling author|\d+(?:st|nd|rd|th) edition)\b/i.test(
      title,
    ) ||
    /\S #\d+$/.test(title) ||
    Object.keys(attributes).some((k) => /^(?:ISBN(?:[- ]?1[03])?|Author|Publisher)$/i.test(k)) ||
    /^97[89]\d{10}$/.test(attributes.GTIN || '')
  )
    return 'books';
  return 'other';
}
