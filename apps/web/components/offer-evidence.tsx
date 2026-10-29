import type { Offer } from '@domain/index';

export function OfferEvidence({ offer, basis }: { offer: Offer; basis: 'item' | 'delivered' }) {
  const validTime = Number.isFinite(offer.observedAt) && offer.observedAt > 0;
  return (
    <details className="offer-evidence">
      <summary>{offer.store === 'Amazon' ? 'Amazon.in' : offer.store} source evidence</summary>
      <dl>
        <dt>Observed</dt>
        <dd>
          {validTime ? (
            <time dateTime={new Date(offer.observedAt).toISOString()}>
              {new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'long',
              }).format(offer.observedAt)}
            </time>
          ) : (
            'Not recorded'
          )}
        </dd>
        <dt>Extraction</dt>
        <dd>
          {offer.extractionMethod || 'Method not recorded for this observation'}
          {offer.parserVersion ? ` · ${offer.parserVersion}` : ''}
        </dd>
        <dt>Comparison basis</dt>
        <dd>
          {basis === 'item'
            ? 'Item price; shipping excluded'
            : 'Delivered total; known shipping required'}
        </dd>
        <dt>Location</dt>
        <dd>{offer.context}</dd>
        <dt>Source</dt>
        <dd>
          {offer.purchaseUrl ? (
            <a href={offer.purchaseUrl} target="_blank" rel="noopener noreferrer">
              Open retailer product page
            </a>
          ) : (
            'Source link not recorded'
          )}
        </dd>
      </dl>
    </details>
  );
}
