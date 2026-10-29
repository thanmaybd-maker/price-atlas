import type { Offer } from '@domain/index';
import { archiveEvidence } from '../../../packages/domain/history-source';

export function HistoryCitation({ offer }: { offer: Offer }) {
  const e = archiveEvidence(offer);
  const time = new Date(offer.observedAt).toISOString();
  return (
    <span className="history-citation">
      {e ? (
        <>
          <a href={e.archiveUrl} target="_blank" rel="noopener noreferrer">
            Internet Archive capture
          </a>
          {' · '}
          <a href={e.originalUrl} target="_blank" rel="noopener noreferrer">
            Original retailer URL
          </a>
        </>
      ) : (
        'Price Atlas observation'
      )}
      {' · '}
      <time dateTime={time}>{time}</time>
      {' · '}
      {e?.extraction || offer.extractionMethod || 'Method not recorded'}
      {e && ' · not a live check'}
    </span>
  );
}
