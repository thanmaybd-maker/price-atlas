import { z } from 'zod';
import { parseRetailUrl, type Offer, type Store } from '../domain/index';
export { RetailerScraperAdapter, livePolicy, getSourceAdapter } from './live';
export { scrapeProduct, parseProductHtml, ScrapeError } from './scraper';

export const capabilitySchema = z
  .object({
    version: z.string().min(1),
    source: z.enum(['Amazon', 'Flipkart']),
    mode: z.enum(['demo', 'live', 'retail']),
    search: z.boolean(),
    resolveLink: z.boolean(),
    currentPrices: z.boolean(),
    history: z.boolean(),
    alerts: z.boolean(),
    matching: z.boolean(),
    aiProcessing: z.boolean(),
    imageProxying: z.boolean(),
    displayTtlSeconds: z.number().int().positive(),
    historyRetentionDays: z.number().int().nonnegative(),
    requestsPerMinute: z.number().int().positive(),
    agreementReference: z.string().nullable(),
  })
  .refine((p) => p.mode !== 'live' || !!p.agreementReference, {
    message: 'A live source requires a recorded agreement reference.',
  });
export type SourcePolicy = z.infer<typeof capabilitySchema>;
const paise = z.number().int().nonnegative().max(1_000_000_000_000);
export const offerSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    store: z.enum(['Amazon', 'Flipkart']),
    itemPrice: paise.positive(),
    shipping: paise.nullable(),
    charges: paise,
    discount: paise,
    currency: z.literal('INR'),
    stock: z.boolean(),
    accepted: z.boolean(),
    condition: z.enum(['new', 'used', 'refurbished', 'unknown']),
    observedAt: z.number().int().positive(),
    validUntil: z.number().int().positive(),
    historyAllowed: z.boolean(),
    alertsAllowed: z.boolean(),
    displayAllowed: z.boolean(),
    seller: z.string(),
    context: z.string().min(1),
    purchaseUrl: z.string().url().optional(),
  })
  .refine((o) => o.discount <= o.itemPrice, { message: 'Discount cannot exceed the item price.' })
  .refine((o) => o.validUntil > o.observedAt, {
    message: 'Observation validity must end after observation time.',
  });
export function validateObservation(value: unknown, policy: SourcePolicy, now = Date.now()): Offer {
  const o = offerSchema.parse(value);
  if (o.store !== policy.source)
    throw new Error('Observation source does not match the adapter policy.');
  if (o.purchaseUrl && parseRetailUrl(o.purchaseUrl).store !== o.store)
    throw new Error('Purchase destination does not match the source.');
  if (o.observedAt > now) throw new Error('Future observation rejected.');
  if (!policy.currentPrices || !o.displayAllowed)
    throw new Error('Source does not permit current price display.');
  return {
    ...o,
    validUntil: Math.min(o.validUntil, o.observedAt + policy.displayTtlSeconds * 1000),
    historyAllowed: o.historyAllowed && policy.history,
    alertsAllowed: o.alertsAllowed && policy.alerts,
  };
}
export interface SourceAdapter {
  policy: SourcePolicy;
  health(): Promise<{ status: 'healthy' | 'paused' | 'unconfigured'; lastSuccess: number | null }>;
  search(query: string): Promise<{ listingId: string; title: string }[]>;
  resolveProduct(
    listingId: string,
  ): Promise<{ listingId: string; attributes: Record<string, string> }>;
  fetchOffers(listingIds: string[], runKey: string): Promise<Offer[]>;
  purchaseLink(listingId: string): Promise<string | null>;
}
export function demoPolicy(store: Store): SourcePolicy {
  return capabilitySchema.parse({
    source: store,
    version: 'demo-v1',
    mode: 'demo',
    search: true,
    resolveLink: false,
    currentPrices: true,
    history: true,
    alerts: true,
    matching: true,
    aiProcessing: false,
    imageProxying: false,
    displayTtlSeconds: 7200,
    historyRetentionDays: 90,
    requestsPerMinute: 60,
    agreementReference: null,
  });
}
export class UnconfiguredSource implements SourceAdapter {
  constructor(public policy: SourcePolicy) {}
  async health() {
    return { status: 'unconfigured' as const, lastSuccess: null };
  }
  async search(_query: string): Promise<{ listingId: string; title: string }[]> {
    throw new Error('Authorized live source is not configured.');
  }
  async resolveProduct(
    _id: string,
  ): Promise<{ listingId: string; attributes: Record<string, string> }> {
    throw new Error('Authorized live resolver is not configured.');
  }
  async fetchOffers(_ids: string[], _key: string): Promise<Offer[]> {
    throw new Error('Authorized live collection is not configured.');
  }
  async purchaseLink(_id: string) {
    return null;
  }
}
