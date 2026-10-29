// Bounded, paced access to web.archive.org. All archive traffic goes through here.
// Redirects are never followed automatically; callers decide with followRedirect().
import type { Store } from '../domain/index';
import {
  ARCHIVE_HOST,
  followRedirect,
  mementoMatches,
  parseCdx,
  type Capture,
  type CdxResult,
  type Window,
} from './wayback';

export const USER_AGENT =
  'PriceAtlas-history-backfill/2.0 (student price-history research; reads public Internet Archive captures)';

export type FetchOutcome =
  | { kind: 'ok'; status: number; headers: Headers; text: string }
  | { kind: 'redirect'; status: number; location: string | null }
  | { kind: 'timeout' }
  | { kind: 'network'; detail: string }
  | { kind: 'http'; status: number }
  | { kind: 'too_large' }
  | { kind: 'bad_type'; type: string }
  | { kind: 'not_archive' }
  | { kind: 'budget_exhausted' };

export type ArchiveClientOptions = {
  fetch?: typeof fetch;
  pauseMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxRetries?: number;
  maxRequests?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ArchiveClient {
  requests = 0;
  outcomes: Record<string, number> = {};
  private last = 0;
  private readonly o: Required<ArchiveClientOptions>;
  constructor(options: ArchiveClientOptions = {}) {
    this.o = {
      fetch: options.fetch ?? fetch,
      pauseMs: options.pauseMs ?? 1500,
      timeoutMs: options.timeoutMs ?? 20000,
      maxBytes: options.maxBytes ?? 6 * 1024 * 1024,
      maxRetries: Math.min(2, options.maxRetries ?? 2),
      maxRequests: options.maxRequests ?? 600,
      sleep: options.sleep ?? realSleep,
      now: options.now ?? Date.now,
    };
  }
  private count(kind: string) {
    this.outcomes[kind] = (this.outcomes[kind] || 0) + 1;
  }
  private async pace() {
    const wait = this.last + this.o.pauseMs - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
    this.last = this.o.now();
  }
  /** One archive GET with pacing, timeout, size/type caps and at most two retries. */
  async get(url: string, accept: RegExp): Promise<FetchOutcome> {
    if (new URL(url).hostname !== ARCHIVE_HOST || !url.startsWith('https://'))
      return { kind: 'not_archive' };
    let outcome: FetchOutcome = { kind: 'network', detail: 'not attempted' };
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      if (this.requests >= this.o.maxRequests) {
        this.count('budget_exhausted');
        return { kind: 'budget_exhausted' };
      }
      await this.pace();
      this.requests++;
      outcome = await this.once(url, accept);
      this.count(outcome.kind === 'http' ? `http_${outcome.status}` : outcome.kind);
      const retryable =
        outcome.kind === 'timeout' ||
        outcome.kind === 'network' ||
        (outcome.kind === 'http' && (outcome.status === 429 || outcome.status >= 500));
      if (!retryable || attempt === this.o.maxRetries) return outcome;
      const after = (outcome as { retryAfter?: number }).retryAfter;
      await this.o.sleep(Math.min(60000, after ?? 4000 * (attempt + 1)));
    }
    return outcome;
  }
  private async once(url: string, accept: RegExp): Promise<FetchOutcome & { retryAfter?: number }> {
    let res: Response;
    try {
      res = await this.o.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json;q=0.9' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout' };
      return { kind: 'network', detail: String((error as Error)?.message || error).slice(0, 160) };
    }
    const drop = () => res.body?.cancel().catch(() => {});
    if (res.status >= 300 && res.status < 400) {
      drop();
      return { kind: 'redirect', status: res.status, location: res.headers.get('location') };
    }
    if (!res.ok) {
      drop();
      const ra = res.headers.get('retry-after');
      const secs =
        ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : ra ? Date.parse(ra) - this.o.now() : NaN;
      return {
        kind: 'http',
        status: res.status,
        retryAfter: Number.isFinite(secs) && secs > 0 ? secs : undefined,
      };
    }
    const type = res.headers.get('content-type') || '';
    if (!accept.test(type)) {
      drop();
      return { kind: 'bad_type', type: type.slice(0, 80) };
    }
    const declared = Number(res.headers.get('content-length'));
    if (declared > this.o.maxBytes) {
      drop();
      return { kind: 'too_large' };
    }
    const reader = res.body?.getReader();
    if (!reader) return { kind: 'ok', status: res.status, headers: res.headers, text: '' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.o.maxBytes) {
          await reader.cancel().catch(() => {});
          return { kind: 'too_large' };
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      const name = (error as Error)?.name;
      return name === 'TimeoutError' || name === 'AbortError'
        ? { kind: 'timeout' }
        : { kind: 'network', detail: 'body read failed' };
    } finally {
      reader.releaseLock();
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { kind: 'ok', status: res.status, headers: res.headers, text };
  }
  async cdx(params: Record<string, string>): Promise<{ fetch: FetchOutcome; cdx?: CdxResult }> {
    const q = new URLSearchParams({ output: 'json', ...params });
    const out = await this.get(
      `https://${ARCHIVE_HOST}/cdx/search/cdx?${q}`,
      /json|text\/plain|^$/i,
    );
    return out.kind === 'ok' ? { fetch: out, cdx: parseCdx(out.text) } : { fetch: out };
  }
}

export type Probe =
  | { reachable: true; result: 'captures' | 'empty'; elapsedMs: number }
  | {
      reachable: false;
      result:
        | 'timeout'
        | 'network'
        | 'forbidden'
        | 'rate_limited'
        | 'server_error'
        | 'http'
        | 'malformed'
        | 'redirect'
        | 'bad_type';
      status?: number;
      detail?: string;
      elapsedMs: number;
    };

/** One short CDX request that tells "archive unreachable" apart from "archive has nothing". */
export async function probeArchive(client: ArchiveClient, now = Date.now()): Promise<Probe> {
  const start = Date.now();
  const year = new Date(now).getUTCFullYear();
  const { fetch: f, cdx } = await client.cdx({
    url: 'amazon.in/dp/B09XS7JWHH',
    from: String(year - 1),
    to: String(year),
    fl: 'timestamp,original,statuscode,mimetype',
    limit: '1',
  });
  const elapsedMs = Date.now() - start;
  if (f.kind === 'ok') {
    if (cdx?.kind === 'malformed')
      return { reachable: false, result: 'malformed', detail: cdx.detail, elapsedMs };
    return { reachable: true, result: cdx?.kind === 'rows' ? 'captures' : 'empty', elapsedMs };
  }
  if (f.kind === 'timeout') return { reachable: false, result: 'timeout', elapsedMs };
  if (f.kind === 'network')
    return { reachable: false, result: 'network', detail: f.detail, elapsedMs };
  if (f.kind === 'redirect')
    return { reachable: false, result: 'redirect', status: f.status, elapsedMs };
  if (f.kind === 'bad_type')
    return { reachable: false, result: 'bad_type', detail: f.type, elapsedMs };
  if (f.kind === 'http')
    return {
      reachable: false,
      result:
        f.status === 403
          ? 'forbidden'
          : f.status === 429
            ? 'rate_limited'
            : f.status >= 500
              ? 'server_error'
              : 'http',
      status: f.status,
      elapsedMs,
    };
  return { reachable: false, result: 'network', detail: f.kind, elapsedMs };
}

export type ReplayResult =
  { ok: true; capture: Capture; html: string; redirects: number } | { ok: false; reason: string };

/**
 * Fetch one raw capture. A redirect is followed only to another raw capture of the same
 * listing on the archive, at most three hops, and the result is labelled with the capture
 * the final response proves through its Memento-Datetime header.
 */
export async function replayCapture(
  client: ArchiveClient,
  capture: Capture,
  listing: { store: Store; externalId: string },
  window: Window,
): Promise<ReplayResult> {
  let current = capture;
  for (let hop = 0; hop <= 3; hop++) {
    const out = await client.get(current.rawUrl, /^text\/html\b/i);
    if (out.kind === 'redirect') {
      if (hop === 3) return { ok: false, reason: 'redirect_limit' };
      const next = followRedirect(out.location, current.rawUrl, listing, window);
      if (!next.ok) return { ok: false, reason: next.reason };
      current = next.capture;
      continue;
    }
    if (out.kind !== 'ok')
      return {
        ok: false,
        reason: out.kind === 'http' ? `fetch_http_${out.status}` : `fetch_${out.kind}`,
      };
    if (!mementoMatches(out.headers.get('memento-datetime'), current))
      return { ok: false, reason: 'memento_mismatch' };
    return { ok: true, capture: current, html: out.text, redirects: hop };
  }
  return { ok: false, reason: 'redirect_limit' };
}
