import { STORE_NAMES, type Store } from './index';
export { STORE_NAMES };
export const retailers: Record<
  Store,
  {
    host: string;
    searchPath: string;
    queryParam: string;
    searchDomain: string;
    international: boolean;
    shippingPolicy: string;
    deliveryNote: string;
  }
> = {
  Amazon: {
    host: 'www.amazon.in',
    searchPath: '/s',
    queryParam: 'k',
    searchDomain: 'amazon.in/dp',
    international: false,
    shippingPolicy: 'https://www.amazon.in/gp/help/customer/display.html',
    deliveryNote: 'Retailer default location; your pincode has not been checked.',
  },
  Flipkart: {
    host: 'www.flipkart.com',
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'flipkart.com',
    international: false,
    shippingPolicy: 'https://www.flipkart.com/pages/shipping',
    deliveryNote: 'Retailer default location; your pincode has not been checked.',
  },
  Meesho: {
    host: 'www.meesho.com',
    searchPath: '/search',
    queryParam: 'q',
    searchDomain: 'meesho.com',
    international: false,
    shippingPolicy: 'https://www.meesho.com',
    deliveryNote: 'Indian delivery is subject to seller and pincode availability.',
  },
  Croma: {
    host: 'www.croma.com',
    searchPath: '/searchB',
    queryParam: 'q',
    searchDomain: 'croma.com',
    international: false,
    shippingPolicy: 'https://www.croma.com/shipping-information',
    deliveryNote: 'Indian delivery is subject to product and pincode availability.',
  },
  Nykaa: {
    host: 'www.nykaa.com',
    searchPath: '/search/result/',
    queryParam: 'q',
    searchDomain: 'nykaa.com',
    international: false,
    shippingPolicy: 'https://www.nykaa.com/shipping-policy',
    deliveryNote: 'Indian delivery is subject to product and pincode availability.',
  },
  iHerb: {
    host: 'in.iherb.com',
    searchPath: '/search',
    queryParam: 'kw',
    searchDomain: 'in.iherb.com/pr',
    international: true,
    shippingPolicy: 'https://www.iherb.com/shipping/in',
    deliveryNote:
      'International retailer serving India. Item eligibility, shipping, customs and KYC requirements must be checked at checkout.',
  },
  'B&H': {
    host: 'www.bhphotovideo.com',
    searchPath: '/c/search',
    queryParam: 'Ntt',
    searchDomain: 'bhphotovideo.com/c/product',
    international: true,
    shippingPolicy: 'https://www.bhphotovideo.com/c/find/HelpCenter/International.jsp',
    deliveryNote:
      'International retailer. India delivery depends on the item; shipping and import fees are additional. Transactions are in USD.',
  },
};
