'use client';
import { useEffect, useState } from 'react';
type Status = { configured: boolean; connected: boolean };
export function TelegramSettings() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState('');
  async function request(method = 'GET') {
    const res = await fetch('/api/v1/telegram', { method });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load Telegram settings.');
    return data;
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () =>
      void request()
        .then((data) => {
          if (!disposed) setStatus(data);
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request('POST');
      setLink(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await request('DELETE');
      setLink('');
      setStatus(await request());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setting-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <strong>Telegram price alerts</strong>
        <p className="muted small">
          {status?.connected
            ? 'Connected. Qualifying alerts go to your private bot chat.'
            : status?.configured
              ? 'Free bot messages. Connect your own private chat, then press Start in Telegram.'
              : 'The bot is awaiting setup. Connection will be available once it is configured.'}
        </p>
        <p className="muted small">
          No email domain required. Alerts depend on fresh checks, source permissions, and your
          notification preferences. Send /stop in Telegram or disconnect here.
        </p>
        {error && <p role="alert">{error}</p>}
        {link && !status?.connected && (
          <p>
            <a className="btn outline" href={link} target="_blank" rel="noopener noreferrer">
              Open Telegram and press Start
            </a>
            <span className="muted small"> Link expires in 10 minutes. Keep it private.</span>
          </p>
        )}
      </div>
      <button
        className="btn outline"
        disabled={busy || !status || (!status.configured && !status.connected)}
        onClick={() => void (status?.connected ? disconnect() : connect())}
      >
        {busy
          ? 'Working…'
          : status?.connected
            ? 'Disconnect Telegram'
            : link
              ? 'Create a new link'
              : 'Connect Telegram'}
      </button>
    </div>
  );
}
