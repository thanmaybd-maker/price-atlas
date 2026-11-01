/** A URL slug is a search hint only. It never establishes product identity or a price. */
export function retailerSearchHint(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !['www.flipkart.com', 'flipkart.com', 'www.nykaa.com', 'nykaa.com'].includes(url.hostname)
    )
      return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const product = parts.indexOf('p');
    if (product !== 1) return null;
    const hint = decodeURIComponent(parts[0]).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    return hint.length >= 4 && hint.length <= 160 && /[a-z]/i.test(hint) ? hint : null;
  } catch {
    return null;
  }
}
