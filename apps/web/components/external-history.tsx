'use client';
// One-click links to free trackers that have older history for this exact listing.
// Each link resolves the product by its store URL; nothing from them enters our charts.

type Tracker = { name: string; href: string; covers: string };

export function trackersFor(sourceUrl?: string): Tracker[] {
  if (!sourceUrl) return [];
  let host = '';
  try {
    host = new URL(sourceUrl).hostname;
  } catch {
    return [];
  }
  const out: Tracker[] = [];
  const asin = sourceUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
  if (/amazon\.in$/.test(host) && asin)
    out.push({
      name: 'Keepa',
      href: `https://keepa.com/#!product/10-${asin}`,
      covers: 'amazon.in, years of history',
    });
  if (/(amazon\.in|flipkart\.com|nykaa\.com|myntra\.com|ajio\.com|meesho\.com)$/.test(host))
    out.push({
      name: 'BuyHatke',
      href: `https://buyhatke.com/${sourceUrl}`,
      covers: 'Amazon, Flipkart, Nykaa, Myntra, AJIO, Meesho',
    });
  if (/(amazon\.in|flipkart\.com)$/.test(host))
    out.push({
      name: 'PriceHistory.ai',
      href: `https://pricehistory.ai/${sourceUrl}`,
      covers: 'Amazon, Flipkart',
    });
  if (/(amazon\.in|flipkart\.com)$/.test(host))
    out.push({
      name: 'PriceBefore',
      href: `https://www.pricebefore.com/search/?q=${encodeURIComponent(sourceUrl)}`,
      covers: 'Amazon, Flipkart',
    });
  return out;
}

export function ExternalHistory({ sourceUrl }: { sourceUrl?: string }) {
  const trackers = trackersFor(sourceUrl);
  if (!trackers.length) return null;
  return (
    <details className="external-history" open>
      <summary>Older history for this exact listing</summary>
      <p>
        Price Atlas charts only prices it checked itself. These free trackers have followed this
        listing for longer; each link opens its chart for this product.
      </p>
      <div className="detail-actions">
        {trackers.map((t) => (
          <a
            key={t.name}
            className="outline-button"
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            title={t.covers}
          >
            {t.name} chart ↗
          </a>
        ))}
      </div>
      <p className="fine-print">
        Independent services: seller, variant and delivery rules can differ from ours.
      </p>
    </details>
  );
}
