'use client';
import { useState } from 'react';
export function Mfa() {
  const [factor, setFactor] = useState<{ id: string; qr: string | null } | null>(null);
  const [message, setMessage] = useState('');
  async function request(body: unknown) {
    const r = await fetch('/api/v1/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }
  return (
    <details className="match-details">
      <summary>Operator verification</summary>
      <p>
        Operator accounts require an authenticator code. Your account ID must also be approved in
        ADMIN_USER_IDS.
      </p>
      {factor ? (
        <>
          {factor.qr && (
            <img
              src={factor.qr}
              alt="Scan this QR code with your authenticator app"
              width={220}
              height={220}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void request({
                action: 'verify',
                factorId: factor.id,
                code: new FormData(e.currentTarget).get('code'),
              })
                .then(() => {
                  setFactor(null);
                  setMessage('Operator verification complete.');
                })
                .catch((e) => setMessage(e.message));
            }}
          >
            <label>
              Authenticator code
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} />
            </label>
            <button className="primary">Verify code</button>
          </form>
        </>
      ) : (
        <button
          className="outline-button"
          onClick={() =>
            void request({ action: 'enroll' })
              .then((data) => setFactor({ id: data.id, qr: data.qr }))
              .catch((e) => setMessage(e.message))
          }
        >
          Set up authenticator
        </button>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
