'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
type Recent = { label: string; href: string };
const KEY = 'price_atlas_recent_v1';
export function RecentHistory({
  query,
  product,
}: {
  query: string;
  product?: { name: string; slug: string };
}) {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
      const previous: Recent[] = Array.isArray(raw)
        ? raw
            .filter(
              (v) =>
                typeof v?.label === 'string' &&
                typeof v?.href === 'string' &&
                /^\/(?:search\?q=|p\/)/.test(v.href),
            )
            .slice(0, 8)
        : [];
      const entry = product
        ? { label: product.name, href: `/p/${encodeURIComponent(product.slug)}` }
        : query.trim().length >= 2
          ? { label: query, href: `/search?q=${encodeURIComponent(query)}` }
          : null;
      const next = entry
        ? [entry, ...previous.filter((v) => v.href !== entry.href)].slice(0, 8)
        : previous;
      localStorage.setItem(KEY, JSON.stringify(next));
      setItems(next);
    } catch {
      /* Storage may be disabled in private classroom browsers. */
    }
  }, [query, product?.slug, product?.name]);
  if (!items.length) return null;
  return (
    <details className="page-width">
      <summary>Recent searches & viewed products</summary>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link prefetch={false} href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <button
        className="text-button"
        onClick={() => {
          try {
            localStorage.removeItem(KEY);
          } catch {}
          setItems([]);
        }}
      >
        Clear recent history
      </button>
    </details>
  );
}
