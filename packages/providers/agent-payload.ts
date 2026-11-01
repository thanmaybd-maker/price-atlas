import { canonicalRetailUrl } from './scraper';

// CLI schema-repair turns can concatenate several fenced/plain JSON answers.
// Keep the final complete products object; never join unrelated model assertions.
export function parseResearchPayload(text: string): unknown {
  if (text.length > 128000) throw new Error('output_limit');
  let depth = 0,
    start = -1,
    quoted = false,
    escaped = false,
    last: unknown;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"' && depth) quoted = true;
    else if (c === '{') {
      if (depth++ === 0) start = i;
    } else if (c === '}' && depth && --depth === 0) {
      try {
        const value = JSON.parse(text.slice(start, i + 1));
        if (Array.isArray(value?.products)) last = value;
      } catch {
        /* A malformed frame cannot replace the last valid structured result. */
      }
    }
  }
  if (last === undefined) throw new Error('invalid_output');
  return last;
}

export async function resolveResearchLinks(raw: unknown, f: typeof fetch = fetch) {
  const list = (raw as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw new Error('invalid_output');
  const products: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const value of list.slice(0, 8)) {
    if (
      !value ||
      typeof value.title !== 'string' ||
      typeof value.url !== 'string' ||
      value.url.length > 4096
    )
      continue;
    if (seen.has(value.url)) continue;
    seen.add(value.url);
    try {
      let destination = value.url;
      try {
        canonicalRetailUrl(destination);
      } catch {
        const url = new URL(destination);
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'vertexaisearch.cloud.google.com' ||
          url.username ||
          url.password ||
          url.port ||
          !url.pathname.startsWith('/grounding-api-redirect/')
        )
          continue;
        // Only fetch Google's public redirect. Never follow an arbitrary destination.
        const response = await f(url.href, {
          redirect: 'manual',
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (![301, 302, 303, 307, 308].includes(response.status) || !location) continue;
        destination = new URL(location, url).href;
      }
      const identity = canonicalRetailUrl(destination);
      products.push({ title: value.title, url: identity.url });
    } catch {
      /* A failed redirect remains unverified and is never fetched as a product. */
    }
  }
  return { products };
}
