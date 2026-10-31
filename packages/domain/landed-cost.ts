// What a shopper pays at checkout, estimated from the checked item price.
//
// Indian retail prices already include GST, so GST is shown as the part of the price that
// is tax (price x rate / (100 + rate)), never added on top. Delivery uses the price the
// store page showed when it was read; otherwise the store's published free-delivery rule.
import type { Category, Offer, Store } from './index';

/** Typical GST slab per category after the September 2025 rate changes (5% / 18%). */
export function gstRate(category: Category, pricePaise: number): number {
  switch (category) {
    case 'books':
      return 0;
    case 'fashion':
      return pricePaise <= 250000 ? 5 : 18;
    case 'home-kitchen':
      return 5;
    case 'services':
      return 18;
    default:
      return 18;
  }
}

type DeliveryRule = { freeFromPaise: number; feePaise: number | null; source: string };
/** Published single-order rules; fee null = charged below the threshold but not published. */
export const DELIVERY_RULES: Partial<Record<Store, DeliveryRule>> = {
  Amazon: {
    freeFromPaise: 49900,
    feePaise: null,
    source: 'Amazon.in: free delivery from ₹499 on items fulfilled by Amazon',
  },
  Nykaa: {
    freeFromPaise: 29900,
    feePaise: 7000,
    source: 'Nykaa shipping policy: ₹70 below ₹299, free from ₹299',
  },
};

export type LandedCost = {
  itemPaise: number;
  gstRate: number;
  gstPaise: number;
  deliveryPaise: number | null;
  deliveryNote: string;
  totalPaise: number | null;
};

export function landedCost(offer: Offer, category: Category): LandedCost {
  const item = offer.itemPrice;
  const rate = gstRate(category, item);
  const gst = Math.round((item * rate) / (100 + rate));
  let delivery: number | null;
  let note: string;
  if (offer.shipping !== null) {
    delivery = offer.shipping;
    note =
      offer.shipping === 0 ? 'Free delivery (shown on store page)' : 'Delivery shown on store page';
  } else {
    const rule = DELIVERY_RULES[offer.store];
    if (rule && item >= rule.freeFromPaise) {
      delivery = 0;
      note = `Free delivery · ${rule.source}`;
    } else if (rule && rule.feePaise != null) {
      delivery = rule.feePaise;
      note = rule.source;
    } else {
      delivery = null;
      note = rule
        ? `Delivery fee applies below ₹${rule.freeFromPaise / 100}; shown at checkout`
        : 'Delivery fee shown at checkout';
    }
  }
  const fees = offer.charges || 0;
  return {
    itemPaise: item,
    gstRate: rate,
    gstPaise: gst,
    deliveryPaise: delivery,
    deliveryNote: note,
    totalPaise: delivery === null ? null : item + delivery + fees,
  };
}
