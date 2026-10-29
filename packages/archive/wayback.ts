// Pure helpers for reading retailer product pages archived by the Internet Archive.
//
// Nothing here performs network or database I/O. Every rule that decides whether an
// archived page may become a dated, history-only price lives here so fixtures can test it.
// A CDX row only says that a page was captured. It is not a price until the archived HTML
// has been fetched from the archive, proven to be that exact capture, parsed, and matched
// to the stored listing's variant.
import { canonicalRetailUrl, parseProductHtml, ScrapeError } from '../providers/scraper';
import { retailers } from '../domain/retailers';
import type { Offer, Store } from '../domain/index';
import {
  categoryFor,
  compareAttributes,
  categoryRegistry,
  normalizedAttributes,
} from '../matching/index';

export const ARCHIVE_HOST = 'web.archive.org';
export const ARCHIVE_CONTEXT = 'Internet Archive snapshot';
export const ARCHIVE_EXTRACTION = 'archived retailer HTML';
export const ARCHIVE_SOURCE = 'wayback';
const DAY = 86400000;
const IST_OFFSET = 19800000;

export const istDay = (ms: number) => new Date(ms + IST_OFFSET).toISOString().slice(0, 10);
export const cdxDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** A 14-digit UTC capture time, or null when JavaScript would have normalized it. */
export function parseCaptureTimestamp(ts: unknown): number | null {
  if (typeof ts !== 'string' || !/^\d{14}$/.test(ts)) return null;
  const n = (a: number, b: number) => Number(ts.slice(a, b));
  const ms = Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14));
  if (!Number.isFinite(ms) || n(0, 4) < 1996) return null;
  const back = new Date(ms).toISOString().replace(/\D/g, '').slice(0, 14);
  return back === ts ? ms : null;
}

export type CdxRow = { timestamp: string; original: string; statuscode: string; mimetype: string };
export type CdxResult =
  { kind: 'rows'; rows: CdxRow[] } | { kind: 'empty' } | { kind: 'malformed'; detail: string };

/** Parse `output=json` CDX text. A header-only or empty array is a successful empty answer. */
export function parseCdx(text: string): CdxResult {
  if (!text.trim()) return { kind: 'malformed', detail: 'empty response body' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'malformed', detail: 'not JSON' };
  }
  if (!Array.isArray(data)) return { kind: 'malformed', detail: 'not an array' };
  if (!data.length) return { kind: 'empty' };
  const header = data[0];
  if (!Array.isArray(header) || !header.every((h) => typeof h === 'string'))
    return { kind: 'malformed', detail: 'missing header row' };
  const at = (name: string) => header.indexOf(name);
  if (at('timestamp') < 0 || at('original') < 0)
    return { kind: 'malformed', detail: 'header lacks timestamp/original' };
  const rows: CdxRow[] = [];
  for (const row of data.slice(1)) {
    if (
      !Array.isArray(row) ||
      row.length !== header.length ||
      !row.every((c) => typeof c === 'string')
    )
      return { kind: 'malformed', detail: 'row shape differs from header' };
    rows.push({
      timestamp: row[at('timestamp')],
      original: row[at('original')],
      statuscode: at('statuscode') >= 0 ? row[at('statuscode')] : '',
      mimetype: at('mimetype') >= 0 ? row[at('mimetype')] : '',
    });
  }
  return rows.length ? { kind: 'rows', rows } : { kind: 'empty' };
}

/**
 * Identify the retailer listing an archived original URL refers to. HTTP originals and
 * default ports are normalized to the HTTPS identity locally; the retailer is never contacted.
 */
export function identifyOriginal(
  original: string,
): { store: Store; externalId: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(original) ? original : `http://${original}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  url.protocol = 'https:';
  url.port = '';
  url.hostname = url.hostname.toLowerCase();
  try {
    const id = canonicalRetailUrl(url.href);
    return { store: id.store, externalId: id.externalId, url: id.url };
  } catch {
    return null;
  }
}

export const archiveRawUrl = (ts: string, original: string) =>
  `https://${ARCHIVE_HOST}/web/${ts}id_/${original}`;
export const archiveViewUrl = (ts: string, original: string) =>
  `https://${ARCHIVE_HOST}/web/${ts}/${original}`;

export type Window = { from: number; to: number; now: number; retentionDays: number };
export type Capture = {
  timestamp: string;
  observedAt: number;
  original: string;
  originalUrl: string;
  rawUrl: string;
  viewUrl: string;
};
export type CaptureReason =
  | 'bad_timestamp'
  | 'future_capture'
  | 'outside_range'
  | 'outside_retention'
  | 'status_not_200'
  | 'not_html'
  | 'unsupported_url'
  | 'wrong_store'
  | 'wrong_listing';

/** Check that a capture time lies inside both the requested range and retention, and not in the future. */
export function checkTime(
  ts: string,
  w: Window,
): { ok: true; ms: number } | { ok: false; reason: CaptureReason } {
  const ms = parseCaptureTimestamp(ts);
  if (ms === null) return { ok: false, reason: 'bad_timestamp' };
  if (ms > w.now) return { ok: false, reason: 'future_capture' };
  if (ms < w.from || ms > w.to) return { ok: false, reason: 'outside_range' };
  if (ms <= w.now - w.retentionDays * DAY) return { ok: false, reason: 'outside_retention' };
  return { ok: true, ms };
}

export function validateCapture(
  row: CdxRow,
  listing: { store: Store; externalId: string },
  w: Window,
): { ok: true; capture: Capture } | { ok: false; reason: CaptureReason } {
  const time = checkTime(row.timestamp, w);
  if (!time.ok) return time;
  if (row.statuscode !== '200') return { ok: false, reason: 'status_not_200' };
  if (!/^text\/html\b/i.test(row.mimetype)) return { ok: false, reason: 'not_html' };
  const id = identifyOriginal(row.original);
  if (!id) return { ok: false, reason: 'unsupported_url' };
  if (id.store !== listing.store) return { ok: false, reason: 'wrong_store' };
  if (id.externalId !== listing.externalId) return { ok: false, reason: 'wrong_listing' };
  return {
    ok: true,
    capture: {
      timestamp: row.timestamp,
      observedAt: time.ms,
      original: row.original,
      originalUrl: id.url,
      rawUrl: archiveRawUrl(row.timestamp, row.original),
      viewUrl: archiveViewUrl(row.timestamp, row.original),
    },
  };
}

export type RedirectDecision =
  | { ok: true; capture: Capture }
  | {
      ok: false;
      reason:
        | 'redirect_bad_location'
        | 'redirect_left_archive'
        | 'redirect_not_raw_capture'
        | 'redirect_other_listing'
        | CaptureReason;
    };

/**
 * Decide whether an archive redirect may be followed. Only a redirect to another raw
 * (`id_`) capture of the same listing on web.archive.org is acceptable, and the capture
 * is then relabelled with the timestamp the redirect proves, which must itself pass the
 * time checks. Anything pointing at a live host or another listing is refused.
 */
export function followRedirect(
  location: string | null,
  from: string,
  listing: { store: Store; externalId: string },
  w: Window,
): RedirectDecision {
  if (!location) return { ok: false, reason: 'redirect_bad_location' };
  let next: URL;
  try {
    next = new URL(location, from);
  } catch {
    return { ok: false, reason: 'redirect_bad_location' };
  }
  if (next.protocol !== 'https:' || next.hostname !== ARCHIVE_HOST || next.port)
    return { ok: false, reason: 'redirect_left_archive' };
  const m = (next.pathname + next.search).match(/^\/web\/(\d{14})id_\/(.+)$/);
  if (!m) return { ok: false, reason: 'redirect_not_raw_capture' };
  const [, ts, original] = m;
  const time = checkTime(ts, w);
  if (!time.ok) return time;
  const id = identifyOriginal(original);
  if (!id || id.store !== listing.store || id.externalId !== listing.externalId)
    return { ok: false, reason: 'redirect_other_listing' };
  return {
    ok: true,
    capture: {
      timestamp: ts,
      observedAt: time.ms,
      original,
      originalUrl: id.url,
      rawUrl: archiveRawUrl(ts, original),
      viewUrl: archiveViewUrl(ts, original),
    },
  };
}

/** The Memento-Datetime header must state exactly the capture second being labelled. */
export function mementoMatches(header: string | null, capture: Capture) {
  if (!header) return false;
  const ms = Date.parse(header);
  return Number.isFinite(ms) && ms === capture.observedAt;
}

export type PageOutcome =
  | { kind: 'parsed'; page: ReturnType<typeof parseProductHtml> }
  | {
      kind:
        | 'empty_html'
        | 'captcha'
        | 'identity_mismatch'
        | 'no_price'
        | 'price_conflict'
        | 'partial_page'
        | 'stock_unknown'
        | 'out_of_stock'
        | 'condition_not_new'
        | 'unparseable';
      detail?: string;
    };

/** Classify archived HTML. Only a full page with a stated price, stock and new condition passes. */
export function classifyPage(
  html: string,
  capture: Capture,
  listing: { store: Store; externalId: string },
): PageOutcome {
  if (html.replace(/<[^>]*>/g, '').trim().length < 40) return { kind: 'empty_html' };
  let page;
  try {
    page = parseProductHtml(html, capture.originalUrl, capture.observedAt);
  } catch (error) {
    if (error instanceof ScrapeError) {
      if (error.code === 'blocked') return { kind: 'captcha' };
      if (error.code === 'identity_mismatch') return { kind: 'identity_mismatch' };
      if (error.code === 'price_missing') return { kind: 'no_price' };
      if (error.code === 'price_conflict') return { kind: 'price_conflict' };
      return { kind: 'unparseable', detail: error.code };
    }
    return {
      kind: 'unparseable',
      detail: String((error as Error)?.message || error).slice(0, 120),
    };
  }
  if (page.store !== listing.store || page.externalId !== listing.externalId)
    return { kind: 'identity_mismatch' };
  if (page.status === 'PARTIAL_UNVERIFIED') return { kind: 'partial_page' };
  if (page.itemPrice === null) return { kind: 'no_price' };
  if (page.stock === null) return { kind: 'stock_unknown' };
  if (page.stock === false) return { kind: 'out_of_stock' };
  if (page.condition !== 'new') return { kind: 'condition_not_new' };
  return { kind: 'parsed', page };
}

export type ListingEvidence = {
  title?: string;
  attributes?: Record<string, string>;
  condition?: string;
};
export type VariantDecision = {
  decision: 'accepted' | 'rejected' | 'unverified';
  category: string;
  checked: string[];
  conflicts: string[];
  missing: string[];
};

/**
 * Match the archived page to the stored listing's decisive attributes, using the same
 * comparison the catalog uses. Attributes the listing never recorded cannot verify
 * anything, so a listing with none of its category's decisive attributes stays unverified.
 */
export function matchArchived(
  evidence: ListingEvidence,
  page: { title: string; attributes: Record<string, string>; condition: string },
): VariantDecision {
  const stored = normalizedAttributes(evidence.attributes || {});
  const category = categoryFor(evidence.title || page.title, stored);
  const decisive = categoryRegistry[category].filter((k) => k !== 'Condition');
  const result = compareAttributes(category, stored, page.attributes);
  const conflicts = [...result.conflicts];
  if (
    evidence.condition &&
    evidence.condition !== 'unknown' &&
    evidence.condition !== page.condition
  )
    conflicts.push('Condition');
  const checked = decisive.filter((k) => stored[k]);
  if (conflicts.length) return { decision: 'rejected', category, checked, conflicts, missing: [] };
  // Variant-guard fields (pack, size, edition, binding, bundle) are reported in
  // signature terms. Any unknown there, or a decisive attribute the listing has but the
  // archive lacks, leaves the snapshot unverified.
  const missing = result.unknown.filter((k) => !decisive.includes(k) || stored[k]);
  if (!checked.length)
    return {
      decision: 'unverified',
      category,
      checked,
      conflicts,
      missing: ['no decisive listing attributes'],
    };
  if (missing.length) return { decision: 'unverified', category, checked, conflicts, missing };
  return { decision: 'accepted', category, checked, conflicts, missing };
}

export type ArchiveOffer = Offer & {
  source: typeof ARCHIVE_SOURCE;
  evidenceUrl: string;
  evidence: {
    kind: 'archive';
    extraction: typeof ARCHIVE_EXTRACTION;
    parserVersion: string;
    originalUrl: string;
    archiveUrl: string;
    rawArchiveUrl: string;
    captureTimestamp: string;
    verifiedLiveByPriceAtlas: false;
    matchedAttributes: string[];
  };
};
export type ArchiveObservation = {
  id: string;
  listingId: string;
  productId: string;
  runKey: string;
  observedAt: number;
  expiresAt: number;
  offer: ArchiveOffer;
};

/** Build the history-only observation. Throws for anything that is not domestic INR history. */
export function buildObservation(
  listing: { id: string; productId: string; store: Store },
  capture: Capture,
  page: ReturnType<typeof parseProductHtml>,
  matched: string[],
  retentionDays: number,
  currency = 'INR',
): ArchiveObservation {
  if (retailers[listing.store].international) throw new Error('cross-border source');
  if (currency !== 'INR') throw new Error('incompatible currency');
  if (page.itemPrice === null || page.stock !== true) throw new Error('not a stated price');
  const id = `wayback:${listing.id}:${capture.timestamp}`;
  return {
    id,
    listingId: listing.id,
    productId: listing.productId,
    runKey: `wayback-${capture.timestamp}`,
    observedAt: capture.observedAt,
    expiresAt: capture.observedAt + retentionDays * DAY,
    offer: {
      id,
      productId: listing.productId,
      store: listing.store,
      itemPrice: page.itemPrice,
      shipping: page.shipping,
      charges: page.charges,
      discount: 0,
      currency,
      stock: true,
      accepted: true,
      condition: page.condition,
      observedAt: capture.observedAt,
      validUntil: capture.observedAt,
      historyAllowed: true,
      alertsAllowed: false,
      displayAllowed: false,
      seller: page.seller,
      context: ARCHIVE_CONTEXT,
      purchaseUrl: capture.viewUrl,
      extractionMethod: ARCHIVE_EXTRACTION,
      parserVersion: page.parserVersion,
      source: ARCHIVE_SOURCE,
      evidenceUrl: capture.viewUrl,
      evidence: {
        kind: 'archive',
        extraction: ARCHIVE_EXTRACTION,
        parserVersion: page.parserVersion,
        originalUrl: capture.originalUrl,
        archiveUrl: capture.viewUrl,
        rawArchiveUrl: capture.rawUrl,
        captureTimestamp: capture.timestamp,
        verifiedLiveByPriceAtlas: false,
        matchedAttributes: matched,
      },
    },
  };
}

/** Recheck a reviewed file at write time; source policy and listing ownership may have changed. */
export function historyWriteRejection(
  o: ArchiveObservation,
  listing: { id: string; productId: string; store: Store; externalId: string },
  now: number,
  retentionDays: number,
): string | null {
  const f = o?.offer;
  const e = f?.evidence;
  if (
    !f ||
    !e ||
    o.listingId !== listing.id ||
    o.productId !== listing.productId ||
    f.productId !== listing.productId ||
    f.store !== listing.store ||
    f.currency !== 'INR' ||
    f.historyAllowed !== true ||
    f.alertsAllowed !== false ||
    f.displayAllowed !== false ||
    f.source !== ARCHIVE_SOURCE ||
    f.accepted !== true ||
    f.stock !== true ||
    f.condition !== 'new' ||
    f.validUntil !== o.observedAt ||
    f.observedAt !== o.observedAt ||
    e.kind !== 'archive' ||
    e.verifiedLiveByPriceAtlas !== false
  )
    return 'not_history_only';
  const nonnegative = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (
    !nonnegative(f.itemPrice) ||
    f.itemPrice === 0 ||
    !(f.shipping === null || nonnegative(f.shipping)) ||
    !nonnegative(f.charges) ||
    f.discount !== 0
  )
    return 'invalid_price';
  const w: Window = { now, to: now, from: now - retentionDays * DAY, retentionDays };
  const checked = followRedirect(e.rawArchiveUrl, 'https://web.archive.org/', listing, w);
  if (!checked.ok) return checked.reason;
  const c = checked.capture;
  if (
    c.observedAt !== o.observedAt ||
    c.timestamp !== e.captureTimestamp ||
    c.originalUrl !== e.originalUrl ||
    c.viewUrl !== e.archiveUrl ||
    f.purchaseUrl !== c.viewUrl ||
    f.evidenceUrl !== c.viewUrl ||
    o.id !== `wayback:${listing.id}:${c.timestamp}` ||
    f.id !== o.id ||
    o.runKey !== `wayback-${c.timestamp}` ||
    !Number.isSafeInteger(o.expiresAt) ||
    o.expiresAt <= now ||
    o.expiresAt > o.observedAt + retentionDays * DAY ||
    !Array.isArray(e.matchedAttributes) ||
    !e.matchedAttributes.length ||
    !e.parserVersion
  )
    return 'invalid_archive_evidence';
  return null;
}

/** CDX prefixes that may hold this listing. Results are still identity-checked per row. */
export function cdxKeys(store: Store, url: string, externalId: string) {
  const u = new URL(url);
  const out = new Set([`${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/\/$/, '')]);
  if (store === 'Amazon') out.add(`amazon.in/dp/${externalId}`);
  return [...out];
}
