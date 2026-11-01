'use client';
import { useEffect, useState } from 'react';

type Reference = {
  rate: number;
  date: string;
  rate_date?: string;
  requested_date?: string;
  source: string;
};
const cache = new Map<string, Promise<Reference | null>>();
const load = (from: string, date?: string) => {
  const key = date ? `${from}@${date}` : from;
  if (!cache.has(key))
    cache.set(
      key,
      fetch(`/api/v1/fx?from=${from}${date ? `&date=${date}` : ''}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j?.reference as Reference) ?? null)
        .catch(() => null),
    );
  return cache.get(key)!;
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
export function FxNote({
  minor,
  currency,
  date,
}: {
  minor: number;
  currency: string;
  date?: string;
}) {
  const [ref, setRef] = useState<Reference | null | undefined>(undefined);
  useEffect(() => {
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'INR') return;
    let alive = true;
    void load(currency, date).then((r) => alive && setRef(r));
    return () => {
      alive = false;
    };
  }, [currency, date]);
  if (currency === 'INR' || ref === undefined) return null;
  if (!ref) return <span className="fx-note">INR reference unavailable right now.</span>;
  const isWeekendOrHoliday = Boolean(ref.requested_date && ref.requested_date !== ref.date);
  return (
    <span className="fx-note">
      ≈ {inr(Math.round(minor * ref.rate))} indicative · ECB rate of {day(ref.date)}
      {isWeekendOrHoliday ? ` (requested ${day(ref.requested_date!)})` : ''} via Frankfurter ·
      excludes shipping, import duty and card fees
    </span>
  );
}

/** Big INR estimate for a foreign price ("≈ ₹5,61,000"), falling back to the native price. */
export function FxPrice({
  minor,
  currency,
  fallback,
}: {
  minor: number;
  currency: string;
  fallback: string;
}) {
  const [ref, setRef] = useState<Reference | null | undefined>(undefined);
  useEffect(() => {
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'INR') return;
    let alive = true;
    void load(currency).then((r) => alive && setRef(r));
    return () => {
      alive = false;
    };
  }, [currency]);
  if (!ref) return <>{fallback}</>;
  return (
    <>
      ≈ {inr(Math.round(minor * ref.rate))}
      <span className="fx-native"> {fallback}</span>
    </>
  );
}
