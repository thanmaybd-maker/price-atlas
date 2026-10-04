'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
function Form() {
  const params = useSearchParams();
  const [message, setMessage] = useState('');
  return (
    <main className="page-width utility-page narrow">
      <h1>Email preferences</h1>
      <p>Stop Price Atlas email alerts. Your saved products remain available.</p>
      <button
        className="primary"
        onClick={async () => {
          const res = await fetch('/api/v1/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: params.get('token') }),
          });
          const result = await res.json();
          setMessage(res.ok ? 'Email alerts have been disabled.' : result.error);
        }}
      >
        Unsubscribe from email alerts
      </button>
      <p role="status">{message}</p>
    </main>
  );
}
export default function Page() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
