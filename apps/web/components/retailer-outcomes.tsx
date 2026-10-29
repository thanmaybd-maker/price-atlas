'use client';
import type { Offer } from '@domain/index';
import { retailerOutcomes, type LookupSource } from '../../../packages/domain/retailer-outcomes';
export function RetailerOutcomes({
  offers,
  sources,
  pending,
}: {
  offers: Offer[];
  sources: LookupSource[];
  pending: boolean;
}) {
  return (
    <details className="retailer-outcomes">
      <summary>Retailer check outcomes</summary>
      <p>
        Supported stores are listed separately from completed checks. Delivery and pincode still
        require checkout verification.
      </p>
      <ul>
        {retailerOutcomes(offers, sources, pending).map((row) => (
          <li key={row.store}>
            <strong>{row.store === 'Amazon' ? 'Amazon.in' : row.store}</strong>
            <span>{row.status}</span>
            {row.at && (
              <time dateTime={new Date(row.at).toISOString()}>
                {new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(row.at)}{' '}
                IST
              </time>
            )}
            <small>{row.method}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
