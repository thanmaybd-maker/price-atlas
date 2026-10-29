export const STORE_NAMES = [
  'Amazon',
  'Flipkart',
  'Meesho',
  'Croma',
  'Nykaa',
  'Reliance Digital',
  'Myntra',
  'AJIO',
  'iHerb',
  'B&H',
] as const;
type Store = (typeof STORE_NAMES)[number];
type Retailer = {
  id: string;
  host: string;
  domains: string[];
  productId: (url: URL) => string | undefined;
  searchPath: string;
  queryParam: string;
  searchDomain: string;
  international: boolean;
  shippingPolicy: string;
  deliveryNote: string;
  categories: string[];
  discoveryFirst?: boolean;
};
export const retailers: Record<Store, Retailer> = {
  Amazon: {
    id: 'amazon_in',
    host: 'www.amazon.in',
    domains: ['amazon.in', 'www.amazon.in'],
    productId: (u) =>
      u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase(),
    searchPath: '/s',
    queryParam: 'k',
    searchDomain: 'amazon.in/dp',
    international: false,
    shippingPolicy: 'https://www.amazon.in/gp/help/customer/display.html',
    deliveryNote: 'Retailer default location; your pincode has not been checked.',
    categories: ['all'],
  },
  Flipkart: {
    id: 'flipkart',
    host: 'www.flipkart.com',
    domains: ['flipkart.com', 'www.flipkart.com'],
    productId: (u) => {
      const pid = u.searchParams.get('pid');
      return pid
        ? /^[A-Z0-9]{8,30}$/i.test(pid)
          ? pid.toUpperCase()
          : undefined
        : u.pathname.match(/\/p\/(itm[a-f0-9]{10,24})(?:\/|$)/i)?.[1]?.toUpperCase();
    },
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'flipkart.com',
    international: false,
    shippingPolicy: 'https://www.flipkart.com/pages/shipping',
    deliveryNote: 'Retailer default location; your pincode has not been checked.',
    categories: ['all'],
  },
  Meesho: {
    id: 'meesho',
    host: 'www.meesho.com',
    domains: ['meesho.com', 'www.meesho.com'],
    productId: (u) =>
      u.pathname.match(/\/(?:[^/]+\/)?p\/([a-z0-9]{4,20})(?:\/|$)/i)?.[1]?.toLowerCase(),
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'meesho.com',
    international: false,
    shippingPolicy: 'https://www.meesho.com',
    deliveryNote: 'Seller and pincode dependent. Verify pack size and delivery at checkout.',
    categories: ['all'],
  },
  Croma: {
    id: 'croma',
    host: 'www.croma.com',
    domains: ['croma.com', 'www.croma.com'],
    productId: (u) => u.pathname.match(/\/p\/(\d{4,12})(?:\/|$)/)?.[1],
    searchPath: '/searchB',
    queryParam: 'q',
    searchDomain: 'croma.com',
    international: false,
    shippingPolicy: 'https://www.croma.com/shipping-information',
    deliveryNote: 'Verify Pincode at Checkout. Stock depends on local fulfillment.',
    categories: [
      'phones',
      'laptops',
      'tablets',
      'audio',
      'monitors',
      'appliances',
      'accessories',
      'stationery',
      'personal-care',
    ],
  },
  Nykaa: {
    id: 'nykaa',
    host: 'www.nykaa.com',
    domains: ['nykaa.com', 'www.nykaa.com'],
    productId: (u) => {
      const id = u.pathname.match(/\/p\/(\d{3,12})(?:\/|$)/)?.[1],
        sku = u.searchParams.get('skuId');
      return id && (!sku || /^\d{3,12}$/.test(sku)) ? sku || id : undefined;
    },
    searchPath: '/search/result/',
    queryParam: 'q',
    searchDomain: 'nykaa.com',
    international: false,
    shippingPolicy: 'https://www.nykaa.com/shipping-policy',
    deliveryNote:
      'Indian delivery is subject to product and pincode availability. Preserve shade and size.',
    categories: ['beauty', 'personal-care'],
  },
  'Reliance Digital': {
    id: 'reliance_digital',
    host: 'www.reliancedigital.in',
    domains: ['reliancedigital.in', 'www.reliancedigital.in'],
    productId: (u) =>
      u.pathname.match(/\/(?:p|product)\/(\d{6,16})(?:\/|$)/)?.[1] ||
      u.pathname.match(/\/product\/[^/]+-([a-z0-9]{6,40})(?:\.html)?\/?$/i)?.[1],
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'reliancedigital.in',
    international: false,
    shippingPolicy: 'https://www.reliancedigital.in',
    deliveryNote: 'Verify Pincode at Checkout. Regional store and warehouse availability varies.',
    categories: [
      'phones',
      'laptops',
      'tablets',
      'audio',
      'monitors',
      'appliances',
      'accessories',
      'stationery',
      'personal-care',
    ],
  },
  Myntra: {
    id: 'myntra',
    host: 'www.myntra.com',
    domains: ['myntra.com', 'www.myntra.com'],
    productId: (u) => u.pathname.match(/\/(\d{5,12})\/buy\/?$/)?.[1],
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'myntra.com',
    international: false,
    discoveryFirst: true,
    shippingPolicy: 'https://www.myntra.com',
    deliveryNote: 'Pincode and size dependent. Discovery links do not verify stock or price.',
    categories: ['fashion', 'beauty', 'personal-care', 'accessories'],
  },
  AJIO: {
    id: 'ajio',
    host: 'www.ajio.com',
    domains: ['ajio.com', 'www.ajio.com'],
    productId: (u) => u.pathname.match(/\/p\/([a-z0-9_]{6,40})(?:\/|$)/i)?.[1],
    searchPath: '/search/',
    queryParam: 'text',
    searchDomain: 'ajio.com',
    international: false,
    discoveryFirst: true,
    shippingPolicy: 'https://www.ajio.com',
    deliveryNote: 'Verify pincode and selected size at checkout.',
    categories: ['fashion', 'accessories', 'home-kitchen', 'beauty'],
  },
  iHerb: {
    id: 'iherb_in',
    host: 'in.iherb.com',
    domains: ['iherb.com', 'www.iherb.com', 'in.iherb.com'],
    productId: (u) => u.pathname.match(/^\/pr\/[^/]+\/(\d{3,12})(?:\/|$)/)?.[1],
    searchPath: '/search',
    queryParam: 'kw',
    searchDomain: 'in.iherb.com/pr',
    international: true,
    shippingPolicy: 'https://www.iherb.com/shipping/in',
    deliveryNote:
      'Cross-border: verify India eligibility, shipping, import duty and KYC at checkout. Listed price is not a landed total.',
    categories: ['personal-care', 'beauty', 'home-kitchen', 'other'],
  },
  'B&H': {
    id: 'bhphoto',
    host: 'www.bhphotovideo.com',
    domains: ['bhphotovideo.com', 'www.bhphotovideo.com'],
    productId: (u) =>
      u.pathname
        .match(/^\/c\/product\/(\d{3,12}-(?:REG|USA|IMP))\/[^/]+\.html(?:\/|$)/i)?.[1]
        ?.toUpperCase(),
    searchPath: '/c/search',
    queryParam: 'Ntt',
    searchDomain: 'bhphotovideo.com/c/product',
    international: true,
    shippingPolicy: 'https://www.bhphotovideo.com/c/find/HelpCenter/International.jsp',
    deliveryNote:
      'International retailer. India eligibility varies by item. Excludes international shipping and Indian import duty; native USD price.',
    categories: ['audio', 'laptops', 'accessories', 'monitors', 'other'],
  },
};
export function retailerForUrl(url: URL) {
  return STORE_NAMES.find((store) => retailers[store].domains.includes(url.hostname.toLowerCase()));
}
export function storesForCategory(category: string) {
  return STORE_NAMES.filter(
    (store) =>
      category === 'other' ||
      retailers[store].categories.some((c) => c === 'all' || c === category),
  );
}
export function retailerSearchUrl(store: Store, query: string) {
  const r = retailers[store],
    url = new URL(r.searchPath, `https://${r.host}`);
  url.searchParams.set(r.queryParam, query);
  return url.href;
}
