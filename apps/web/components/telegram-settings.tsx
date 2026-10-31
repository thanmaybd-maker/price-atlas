'use client';
import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
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
    const stop = visiblePoll(refresh, link && !status?.connected ? 4000 : 60000);
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
        {link &&
          !status?.connected &&
          (() => {
            const u = new URL(link);
            const bot = u.pathname.slice(1);
            const token = u.searchParams.get('start') || '';
            return (
              <div className="telegram-steps">
                <p>
                  Press <b>Start</b> in Telegram. This page turns to “Connected” by itself within a
                  few seconds, and the bot sends you a confirmation message.
                </p>
                <div className="telegram-connect">
                  <figure
                    className="telegram-qr"
                    aria-label="QR code: scan with your phone camera to open the bot in Telegram"
                    dangerouslySetInnerHTML={{ __html: qrSvg(link) }}
                  />
                  <div>
                    <p className="small">
                      <b>On your phone:</b> scan this code with the camera, then tap Start.
                    </p>
                    <p className="small">
                      <b>On this computer:</b>
                    </p>
                    <div className="detail-actions">
                      <a
                        className="outline-button primary"
                        href={`https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(`tg://resolve?domain=${bot}&start=${token}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Telegram Web
                      </a>
                      <a
                        className="outline-button"
                        href={`tg://resolve?domain=${bot}&start=${token}`}
                      >
                        Open Telegram desktop app
                      </a>
                    </div>
                  </div>
                </div>
                <p className="muted small">
                  Nothing opened? In Telegram search <b>@{bot}</b> and send this message:{' '}
                  <code>/start {token}</code>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void navigator.clipboard?.writeText(`/start ${token}`)}
                  >
                    Copy
                  </button>
                  . The code works for 10 minutes; keep it private.
                </p>
              </div>
            );
          })()}
      </div>
      {status?.connected && (
        <button className="outline-button primary" disabled={busy} onClick={() => void sendTest()}>
          Send test message
        </button>
      )}
      <button
        className={status?.connected || link ? 'outline-button' : 'outline-button primary'}
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

function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
