import {
  capabilitySchema,
  validateObservation,
  type SourcePolicy,
  type SourceAdapter,
} from './index';
import {
  scrapeProduct,
  canonicalRetailUrl,
  listingKey,
  observationKey,
  type ScrapedProduct,
} from './scraper';
import type { Offer, Store } from '../domain/index';
export function livePolicy(store: Store): SourcePolicy {
  const configured = process.env.SOURCE_POLICIES_JSON
    ? JSON.parse(process.env.SOURCE_POLICIES_JSON)
    : {};
  if (configured[store]) {
    const policy = capabilitySchema.parse(configured[store]);
    if (policy.source !== store || policy.mode !== 'live')
      throw new Error('Source policy identity mismatch.');
    return policy;
  }
  // Development imports may display a current page; retention and alerts never
  // follow merely from the existence of a scraper or proxy API credential.
  return {
    source: store,
    version: 'unverified-development',
    mode: 'live',
    search: false,
    resolveLink: true,
    currentPrices: true,
    history: false,
    alerts: false,
    matching: false,
    aiProcessing: false,
    imageProxying: false,
    displayTtlSeconds: 3600,
    historyRetentionDays: 0,
    requestsPerMinute: 2,
    agreementReference: null,
  };
}
export class RetailerScraperAdapter implements SourceAdapter {
  policy: SourcePolicy;
  private lastSuccess: number | null = null;
  constructor(
    public store: Store,
    private listingUrls: Record<string, string> = {},
  ) {
    this.policy = livePolicy(store);
  }
  async health() {
    return { status: 'healthy' as const, lastSuccess: this.lastSuccess };
  }
  async search(_query: string): Promise<{ listingId: string; title: string }[]> {
    throw new Error(
      'Discovery search requires a configured licensed source. Import a direct product URL.',
    );
  }
  async scrape(url: string): Promise<ScrapedProduct> {
    if (canonicalRetailUrl(url).store !== this.store) throw new Error('Wrong retailer adapter.');
    const result = await scrapeProduct(url);
    this.listingUrls[result.externalId] = result.url;
    this.lastSuccess = Date.now();
    return result;
  }
  async resolveProduct(id: string) {
    const url = await this.purchaseLink(id);
    if (!url) throw new Error('Supply the stored Flipkart product URL to resolve this listing.');
    const result = await this.scrape(url);
    return { listingId: id, attributes: result.attributes };
  }
  async fetchOffers(ids: string[], run: string): Promise<Offer[]> {
    const results: Offer[] = [];
    for (const externalId of ids) {
      const url = await this.purchaseLink(externalId);
      if (!url) throw new Error('The stored Flipkart product URL is required.');
      const p = await this.scrape(url);
      if (p.itemPrice === null) continue;
      const id = listingKey(p);
      results.push(
        validateObservation(
          {
            id: observationKey(id, run),
            productId: id,
            store: this.store,
            itemPrice: p.itemPrice,
            shipping: p.shipping,
            charges: p.charges,
            discount: 0,
            currency: 'INR',
            stock: p.stock === true,
            accepted: true,
            condition: p.condition,
            observedAt: p.observedAt,
            validUntil: p.observedAt + this.policy.displayTtlSeconds * 1000,
            historyAllowed: this.policy.history,
            alertsAllowed: this.policy.alerts,
            displayAllowed: this.policy.currentPrices,
            seller: p.seller,
            context: 'Retailer default location; your pincode not checked',
            purchaseUrl: p.url,
          },
          this.policy,
        ),
      );
    }
    return results;
  }
  async purchaseLink(id: string) {
    if (id.startsWith('https://')) {
      const link = canonicalRetailUrl(id);
      if (link.store !== this.store) throw new Error('Wrong retailer.');
      return link.url;
    }
    if (this.listingUrls[id]) return this.listingUrls[id];
    if (
      (this.store === 'Amazon' && !/^[A-Z0-9]{10}$/i.test(id)) ||
      (this.store === 'Flipkart' && !/^[A-Z0-9]{8,30}$/i.test(id))
    )
      throw new Error('Invalid retailer ID.');
    return this.store === 'Amazon' ? `https://www.amazon.in/dp/${id}` : null;
  }
}
export const getSourceAdapter = (store: Store, urls?: Record<string, string>) =>
  new RetailerScraperAdapter(store, urls);
