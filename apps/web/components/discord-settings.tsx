'use client';
import { useEffect, useState } from 'react';

const reasons: Record<string, string> = {
  invalid_url:
    'That is not a Discord webhook link. It starts with https://discord.com/api/webhooks/.',
  webhook_deleted: 'Discord says this webhook was deleted. Create a new one and paste it again.',
  rate_limited: 'Too many tries. Wait a minute.',
  not_connected: 'Connect a channel first.',
};

export function DiscordSettings() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const load = () =>
    fetch('/api/v1/discord')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConnected(Boolean(j?.connected)))
      .catch(() => setConnected(false));
  useEffect(() => {
    void load();
  }, []);
  async function call(method: string, query = '', body?: unknown) {
    setBusy(true);
    setNote('');
    try {
      const res = await fetch(`/api/v1/discord${query}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok === false)
        setNote(reasons[j.reason] || `Discord did not accept it (${j.reason || res.status}).`);
      return j;
    } catch {
      setNote('Connection request failed. Check your network connection.');
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setting-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <strong>Discord price alerts</strong>
        <p className="muted small">
          {connected
            ? 'Connected. Alerts post directly to your Discord channel.'
            : 'Free. In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL, then paste it here.'}
        </p>
        {!connected && (
          <form
            className="detail-actions"
            onSubmit={(e) => {
              e.preventDefault();
              if (!url.trim()) {
                setNote('Paste a Discord webhook URL into the field first.');
                return;
              }
              void call('PUT', '', { url }).then((j) => {
                if (j?.ok) {
                  setUrl('');
                  setNote('Connected! Check your Discord channel for the confirmation message.');
                  void load();
                }
              });
            }}
          >
            <input
              aria-label="Discord webhook URL"
              placeholder="https://discord.com/api/webhooks/…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (note) setNote('');
              }}
              style={{ flex: 1, minWidth: 240 }}
            />
            {typeof navigator !== 'undefined' && navigator.clipboard && (
              <button
                type="button"
                className="outline-button"
                style={{ padding: '8px 12px', fontSize: 12 }}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setUrl(text.trim());
                  } catch {}
                }}
              >
                Paste
              </button>
            )}
            <button
              type="submit"
              className="primary"
              disabled={busy || !url.trim()}
              title={!url.trim() ? 'Paste a webhook URL to enable' : 'Connect this Discord channel'}
            >
              {busy ? 'Checking…' : 'Connect Discord'}
            </button>
          </form>
        )}
        {note && (
          <p role="status" className="small" style={{ marginTop: 8, fontWeight: 500 }}>
            {note}
          </p>
        )}
      </div>
      {connected && (
        <div className="detail-actions" style={{ marginTop: 8 }}>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void call('POST', '?test=1').then(
                (j) => j?.ok && setNote('Test alert posted to your channel!'),
              )
            }
          >
            {busy ? 'Posting…' : 'Send test alert'}
          </button>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => void call('DELETE').then(() => load())}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
