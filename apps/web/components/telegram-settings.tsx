'use client';
import { useEffect, useState } from 'react';
import { visiblePoll } from '../lib/visible-poll';
type Status = { configured: boolean; connected: boolean };
export function TelegramSettings() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState('');
  async function request(method = 'GET') {
    const res = await fetch('/api/v1/telegram', { method });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        res.status === 401
          ? 'Sign in first, then connect Telegram from this page.'
          : `${data.error || 'Telegram could not be reached.'} (HTTP ${res.status}${data.requestId ? `, ref ${String(data.requestId).slice(0, 8)}` : ''})`,
      );
    return data;
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () =>
      request()
        .then((data) => {
          if (!disposed) {
            setStatus(data);
            setError('');
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    void refresh();
    const stop = visiblePoll(refresh, link && !status?.connected ? 15000 : 60000);
    return () => {
      disposed = true;
      stop();
    };
  }, [link, status?.connected]);
  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request('POST');
      if (typeof result.url !== 'string' || !result.url.startsWith('https://t.me/'))
        throw new Error('The server did not return a Telegram link. Please try again.');
      setLink(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [test, setTest] = useState('');
  async function sendTest() {
    setBusy(true);
    setTest('');
    try {
      const res = await fetch('/api/v1/telegram?test=1', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setTest(
        data.ok
          ? 'Test message sent. Check your Telegram chat with the bot.'
          : data.reason === 'blocked'
            ? 'Telegram says the bot is blocked. Unblock it in Telegram, press Start, then try again.'
            : data.reason === 'not_connected'
              ? 'Not connected yet. Open the link and press Start in Telegram first.'
              : data.reason === 'rate_limited'
                ? 'Too many tests. Wait a minute and try again.'
                : `Telegram did not confirm delivery (${data.reason || `HTTP ${res.status}`}).`,
      );
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
        {test && <p role="status">{test}</p>}
        {link && !status?.connected && (
          <p>
            <a className="btn outline" href={link} target="_blank" rel="noopener noreferrer">
              Open Telegram and press Start
            </a>
            <span className="muted small"> Link expires in 10 minutes. Keep it private.</span>
          </p>
        )}
      </div>
      {status?.connected && (
        <button className="btn outline" disabled={busy} onClick={() => void sendTest()}>
          Send test message
        </button>
      )}
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
