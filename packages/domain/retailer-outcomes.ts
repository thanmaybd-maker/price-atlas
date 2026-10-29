import { STORE_NAMES, eligible, type Offer, type Store } from './index';
export type LookupSource = { store: Store; method: string; status: string };
export function retailerOutcomes(
  offers: Offer[],
  sources: LookupSource[],
  pending = false,
  now = Date.now(),
) {
  return STORE_NAMES.map((store) => {
    const offer = offers
      .filter((o) => o.store === store && eligible(o, now))
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    const source = sources.find((s) => s.store === store);
    const observed = offers
      .filter((o) => o.store === store)
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    if (offer)
      return {
        store,
        status: 'Verified recorded offer',
        at: offer.observedAt,
        method: offer.extractionMethod || 'method not recorded',
      };
    if (observed)
      return {
        store,
        status: 'Recorded listing · not eligible to rank',
        at: observed.observedAt,
        method: observed.extractionMethod || 'method not recorded',
      };
    const state = source?.status;
    return {
      store,
      status:
        state === 'blocked'
          ? 'Blocked by retailer'
          : state === 'no_results'
            ? 'No matching product found'
            : state === 'candidates_only'
              ? 'Discovery observed · price unverified'
              : state === 'complete'
                ? 'Metadata observed · no verified price'
                : state
                  ? `Not checked successfully · ${state.replaceAll('_', ' ')}`
                  : pending
                    ? 'Waiting for check results'
                    : 'Not checked',
      at: null,
      method: source?.method || 'No source observation',
    };
  });
}
