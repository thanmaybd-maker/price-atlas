'use client';
import { useState } from 'react';

export function ExternalHistory({ sourceUrl }: { sourceUrl?: string }) {
  const [message, setMessage] = useState('');
  return (
    <details className="external-history">
      <summary>Need history from before tracking started?</summary>
      <p>
        Free public trackers may have older checks for this exact listing. Open a tracker and paste
        the product link. Coverage, seller, variant and delivery rules can differ.
      </p>
      {sourceUrl && (
        <>
          <label>
            Product link{' '}
            <input
              aria-label="Product link for external history"
              value={sourceUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="outline-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sourceUrl);
                setMessage('Product link copied. Paste it into the tracker.');
              } catch {
                setMessage('Select and copy the product link above.');
              }
            }}
          >
            Copy product link
          </button>
        </>
      )}
      <div className="detail-actions">
        <a
          className="outline-button"
          href="https://pricehistory.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open PriceHistory.app
        </a>
        <a
          className="outline-button"
          href="https://pricehistory.ai/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open PriceHistory.ai
        </a>
      </div>
      <p role="status">{message}</p>
      <p className="fine-print">
        External services are independent. Their data is not imported into Price Atlas rankings,
        charts or alerts.
      </p>
    </details>
  );
}
