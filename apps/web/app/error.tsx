'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 80 }}>
      <h1>We couldn’t load this view.</h1>
      <p>Your saved data is still in the database. Try again in a moment.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
