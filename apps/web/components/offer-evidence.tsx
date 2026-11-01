import { eligible, type Offer } from '../../../packages/domain/index';

export function OfferEvidence({ offer, basis }: { offer: Offer; basis: 'item' | 'delivered' }) {
  const validTime = Number.isFinite(offer.observedAt) && offer.observedAt > 0;
  const checked = eligible(offer);
  return (
    <div className="offer-verification-container" data-testid="offer-evidence">
      <span className={`verified-badge${checked ? '' : ' is-unverified'}`}>
        {checked ? '✓ Checked item price' : 'Recorded price · verify on store'} • {offer.currency} •
        Source: {offer.store}
      </span>
      <details className="evidence-debug-accordion">
        <summary className="evidence-debug-summary">Price source and verification</summary>
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
    </div>
  );
}
