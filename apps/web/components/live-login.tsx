'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
export function LiveLogin({ returnTo }: { returnTo?: string }) {
  const params = useSearchParams();
  const [message, setMessage] = useState(
    params.get('error') ? 'That sign-in link expired. Request a new one.' : '',
  );
  const [busy, setBusy] = useState(false);
  async function signIn(provider: 'email' | 'google', email?: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, email, next: returnTo || '/watchlist' }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (result.url) window.location.assign(result.url);
      else setMessage('Check your email for your sign-in link. Open it in this browser.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signIn('email', String(new FormData(e.currentTarget).get('email')));
        }}
      >
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            maxLength={254}
          />
        </label>
        <button className="primary full-width" disabled={busy}>
          Email me a sign-in link
        </button>
      </form>
      <button
        className="secondary full-width"
        disabled={busy}
        onClick={() => void signIn('google')}
      >
        Continue with Google
      </button>
      <p className="fine-print" role="status">
        {message || 'Your verified account keeps saved products across devices.'}
      </p>
    </>
  );
}
