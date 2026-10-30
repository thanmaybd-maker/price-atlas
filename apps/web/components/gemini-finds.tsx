'use client';
// "Any product" lookup: Gemini with Google Search finds where it is sold, then each page
// is checked by Price Atlas before a price is saved. Quoted prices here are the web
// search's words, labelled as unchecked; they never enter comparison, history or alerts.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

type Candidate = { title: string; store: string; url: string; quotedRupees: number | null };
type Result = {
  available: boolean;
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

export function GeminiBadge({ working = false }: { working?: boolean }) {
  return (
    <span className={working ? 'gemini-badge gemini-live working' : 'gemini-badge gemini-live'}>
      <span className="gemini-orb" aria-hidden="true">
        <Sparkles size={12} />
      </span>
      <span className="gemini-word">Powered by Gemini</span>
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
    const timer = setTimeout(() => controller.abort(), 26000);
    setState({ for: query, result: null });
    fetch(`/api/v1/ai-discover?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) =>
        setState({
          for: query,
          result: j ?? { available: true, candidates: [], sources: [], reason: 'error' },
        }),
      )
      .catch(() =>
        setState({
          for: query,
          result: { available: true, candidates: [], sources: [], reason: 'timeout' },
        }),
      );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const result = state.for === query ? state.result : null;
  if (result && !result.available) return null;
  return (
    <section className="gemini-finds" aria-label="Found on the web by Gemini" aria-busy={!result}>
      <header>
        <GeminiBadge working={!result} />
        <h2>{result ? 'Where it’s sold' : 'Searching the web for this product…'}</h2>
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
                      ` · web search says ${inr(c.quotedRupees)} · not yet checked`}
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
            Gemini finds the store pages. Price Atlas then opens each page itself and saves only the
            price it sees there, so history and alerts use checked prices.
          </p>
          {result.sources.length > 0 && (
            <details className="gemini-sources">
              <summary>Google Search sources</summary>
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
          {result.reason === 'limited'
            ? 'Gemini search limit reached for now. Try again in a minute, or paste the product link.'
            : result.reason === 'timeout' || result.reason === 'error'
              ? 'Gemini didn’t answer in time. Paste the product link from the store and Price Atlas will track it.'
              : 'Gemini found no Indian store page for this exact product. Paste its link from the store to track it.'}
        </p>
      )}
    </section>
  );
}
