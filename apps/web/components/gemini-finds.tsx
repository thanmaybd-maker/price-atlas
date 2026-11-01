'use client';
// "Any product" lookup: Gemini with Google Search finds where it is sold, then each page
// is checked by Price Atlas before a price is saved. Quoted prices here are the web
// search's words, labelled as unchecked; they never enter comparison, history or alerts.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

type Candidate = { title: string; store: string; url: string; quotedRupees: number | null };
type Result = {
  provider?: string;
  available: boolean;
  grounded?: boolean;
  via?: string;
  candidates: Candidate[];
  sources: { title: string; uri: string }[];
  reason?: string;
};
const inr = (rupees: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);

export function GeminiBadge({
  working = false,
  provider = 'gemini',
}: {
  working?: boolean;
  provider?: string;
}) {
  return (
    <span className={working ? 'gemini-badge gemini-live working' : 'gemini-badge gemini-live'}>
      <span className="gemini-orb" aria-hidden="true">
        <Sparkles size={12} />
      </span>
      <span className="gemini-word">
        {provider === 'antigravity'
          ? 'Antigravity research'
          : provider === 'pending'
            ? 'Product research'
            : 'Powered by Gemini'}
      </span>
    </span>
  );
}

export function GeminiFinds({ query }: { query: string }) {
  const [state, setState] = useState<{ for: string; result: Result | null }>({
    for: '',
    result: null,
  });
  useEffect(() => {
    if (query.trim().length < 2 || /^https?:\/\//i.test(query)) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 240000);
    let retry: ReturnType<typeof setTimeout>;
    setState({ for: query, result: null });
    const check = () =>
      fetch(`/api/v1/ai-discover?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(26000)]),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Result | null) => {
          if (!active || controller.signal.aborted) return;
          setState({
            for: query,
            result: j ?? { available: true, candidates: [], sources: [], reason: 'error' },
          });
          if (j?.provider === 'antigravity' && j.reason === 'pending')
            retry = setTimeout(check, 4000);
          else if (j?.provider === 'antigravity' && j.candidates.length)
            window.dispatchEvent(new CustomEvent('atlas:research-ready', { detail: { query } }));
        })
        .catch(
          () =>
            active &&
            setState((previous) => ({
              for: query,
              result: {
                provider: previous.result?.provider,
                available: true,
                candidates: [],
                sources: [],
                reason: 'timeout',
              },
            })),
        );
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(retry);
      controller.abort();
    };
  }, [query]);
  const result = state.for === query ? state.result : null;
  if (result && !result.available) return null;
  return (
    <section
      className="gemini-finds"
      aria-label="Additional retailer research"
      aria-busy={!result || result.reason === 'pending'}
    >
      <header>
        <GeminiBadge
          working={!result || result.reason === 'pending'}
          provider={result?.provider || 'pending'}
        />
        <h2>
          {result?.reason === 'pending'
            ? 'Checking additional retailers…'
            : result
              ? 'Where it’s sold'
              : 'Searching the web for this product…'}
        </h2>
      </header>
      {!result && (
        <div className="gemini-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      {result && result.candidates.length > 0 && (
        <>
          <ul className="gemini-list">
            {result.candidates.map((c, i) => (
              <li key={c.url} style={{ animationDelay: `${i * 70}ms` }}>
                <div>
                  <strong>{c.title}</strong>
                  <span className="muted small">
                    {c.store}
                    {c.quotedRupees != null &&
                      ` · listed at ${inr(c.quotedRupees)} · not yet checked`}
                  </span>
                </div>
                <Link
                  prefetch={false}
                  className="outline-button"
                  href={`/search?q=${encodeURIComponent(c.url)}`}
                >
                  Check live price &amp; track <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
          <p className="fine-print">
            {result.provider === 'antigravity'
              ? 'Store links found by Antigravity. '
              : result.via === 'web-search'
                ? 'Live store results plus Gemini suggestions. '
                : result.grounded === false
                  ? 'Links suggested by Gemini. '
                  : 'Store pages found by Gemini with Google Search. '}
            Price Atlas opens each page itself and saves only the price it sees there, so history
            and alerts use checked prices.
          </p>
          {result.sources.length > 0 && (
            <details className="gemini-sources">
              <summary>
                {result.provider === 'antigravity'
                  ? 'Research source links'
                  : 'Google Search sources'}
              </summary>
              <ul>
                {result.sources.map((s) => (
                  <li key={s.uri}>
                    <a href={s.uri} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {result && !result.candidates.length && (
        <p className="muted small" role="status">
          {result.provider === 'antigravity'
            ? result.reason === 'pending'
              ? 'Background research is running. You can use the recorded results above while it checks more stores.'
              : result.reason === 'offline'
                ? 'Background research is unavailable. Recorded products and store search still work.'
                : result.reason === 'limited'
                  ? 'The daily background research allowance is reached. Recorded products and store search still work.'
                  : result.reason === 'busy'
                    ? 'Background research is busy. Try again shortly, or use the store results above.'
                    : result.reason === 'error' || result.reason === 'timeout'
                      ? 'Background research could not finish. You can still paste a product link to check it.'
                      : 'No additional matching store links were found.'
            : result.reason === 'limited'
              ? 'Gemini search limit reached for now. Try again in a minute, or paste the product link.'
              : result.reason === 'timeout' || result.reason === 'error'
                ? 'Gemini didn’t answer in time. Paste the product link from the store and Price Atlas will track it.'
                : 'Gemini found no Indian store page for this exact product. Paste its link from the store to track it.'}
        </p>
      )}
    </section>
  );
}
