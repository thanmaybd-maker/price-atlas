'use client';
import { useState } from 'react';
type State = {
  providers: { store: string; paused: number }[];
  listings?: {
    id: string;
    product_id: string;
    store: string;
    match_state: string;
    failures: number;
  }[];
  quarantine?: { id: string; listing_id: string; reason: string }[];
  jobs?: { id: string; last_error: string; attempts: number }[];
  telegram?: { notification_id: string; state: string; last_error: string; attempts: number }[];
  capabilities?: {
    source: string;
    history: boolean;
    alerts: boolean;
    agreementReference: string | null;
  }[];
};
export function Operations({ state, reload }: { state: State; reload: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [duplicateRiskAccepted, setDuplicateRiskAccepted] = useState(false);
  async function action(path: string, body: unknown) {
    if (reason.trim().length < 5) {
      setMessage('Add an audit reason of at least five characters.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(body as object), reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await reload();
      setMessage('Operation recorded.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-panel">
      <h2>Operator controls</h2>
      <label>
        Audit reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </label>
      <p role="status">{message}</p>
      <div className="detail-actions">
        <button className="primary" disabled={busy} onClick={() => void action('collect', {})}>
          Schedule due checks
        </button>
        {state.providers.map((p) => (
          <button
            className="outline-button"
            disabled={busy}
            key={p.store}
            onClick={() => void action('provider', { store: p.store, paused: !p.paused })}
          >
            {p.paused ? 'Resume' : 'Pause'} {p.store}
          </button>
        ))}
      </div>
      <h3>Source capabilities</h3>
      {state.capabilities?.map((p) => (
        <p key={p.source}>
          {p.source}: history {p.history ? 'enabled' : 'disabled'} · alerts{' '}
          {p.alerts ? 'enabled' : 'disabled'} ·{' '}
          {p.agreementReference ||
            (p.mode === 'retail' ? 'Retailer-page tracking' : 'source permissions unverified')}
        </p>
      ))}
      <h3>Listing matches</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Listing</th>
              <th>Identity</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {state.listings?.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td>
                  {l.match_state} · {l.failures} failures
                </td>
                <td>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action('match', {
                        listingId: l.id,
                        productId: new FormData(e.currentTarget).get('productId'),
                      });
                    }}
                  >
                    <input
                      name="productId"
                      defaultValue={l.product_id}
                      aria-label={`Canonical product for ${l.id}`}
                      required
                      maxLength={100}
                    />
                    <button className="outline-button" disabled={busy}>
                      Validate and assign
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Price anomalies</h3>
      {state.quarantine?.length ? (
        state.quarantine.map((q) => (
          <div className="setting-row" key={q.id}>
            <p>
              {q.listing_id}: {q.reason}
            </p>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void action('anomaly', { id: q.id, accept: true })}
            >
              Approve
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void action('anomaly', { id: q.id, accept: false })}
            >
              Reject
            </button>
          </div>
        ))
      ) : (
        <p>No anomalies awaiting review.</p>
      )}
      <h3>Telegram delivery review</h3>
      <p>
        Telegram may have delivered an uncertain message. Check the recipient’s chat before
        retrying.
      </p>
      <label>
        <input
          type="checkbox"
          checked={duplicateRiskAccepted}
          onChange={(e) => setDuplicateRiskAccepted(e.target.checked)}
        />{' '}
        I checked the chat and accept the risk of a duplicate message.
      </label>
      {state.telegram?.length ? (
        state.telegram.map((t) => (
          <div className="setting-row" key={t.notification_id}>
            <p>
              {t.state} · {t.last_error} · {t.attempts} attempts
            </p>
            <button
              className="outline-button"
              disabled={busy || !duplicateRiskAccepted}
              onClick={() =>
                void action('telegram', {
                  id: t.notification_id,
                  decision: 'retry',
                  duplicateRiskAccepted,
                })
              }
            >
              Retry Telegram message
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() =>
                void action('telegram', { id: t.notification_id, decision: 'dismiss' })
              }
            >
              Close without resending
            </button>
          </div>
        ))
      ) : (
        <p>No Telegram deliveries awaiting review.</p>
      )}
      <h3>Failed collection jobs</h3>
      {state.jobs?.length ? (
        state.jobs.map((j) => (
          <div className="setting-row" key={j.id}>
            <p>
              {j.last_error} · {j.attempts} attempts
            </p>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void action('retry', { id: j.id })}
            >
              Retry
            </button>
          </div>
        ))
      ) : (
        <p>No failed jobs.</p>
      )}
    </div>
  );
}
