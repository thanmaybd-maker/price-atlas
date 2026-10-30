'use client';
import { useEffect, useState } from 'react';

type Reference = { rate: number; date: string; source: string };
const cache = new Map<string, Promise<Reference | null>>();
const load = (from: string) => {
  if (!cache.has(from))
    cache.set(
      from,
      fetch(`/api/v1/fx?from=${from}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j?.reference as Reference) ?? null)
        .catch(() => null),
    );
  return cache.get(from)!;
};
const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
const day = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

/** "≈ ₹2,102 indicative" for a native amount, with the dated ECB reference it used. */
export function FxNote({ minor, currency }: { minor: number; currency: string }) {
  const [ref, setRef] = useState<Reference | null | undefined>(undefined);
  useEffect(() => {
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'INR') return;
    let alive = true;
    void load(currency).then((r) => alive && setRef(r));
    return () => {
      alive = false;
    };
  }, [currency]);
  if (currency === 'INR' || ref === undefined) return null;
  if (!ref) return <span className="fx-note">INR reference unavailable right now.</span>;
  return (
    <span className="fx-note">
      ≈ {inr(Math.round(minor * ref.rate))} indicative · ECB rate of {day(ref.date)} via Frankfurter
      · excludes shipping, import duty and card fees
    </span>
  );
}
