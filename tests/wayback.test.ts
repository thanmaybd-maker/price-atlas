// Fixture-only tests for the Internet Archive history backfill. No live archive or Supabase.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import {
  parseCaptureTimestamp,
  parseCdx,
  identifyOriginal,
  validateCapture,
  followRedirect,
  mementoMatches,
  classifyPage,
  matchArchived,
  buildObservation,
  historyWriteRejection,
  type CdxRow,
  type Window,
} from '../packages/archive/wayback';
import { ArchiveClient, probeArchive, replayCapture } from '../packages/archive/fetch';
import { observationsDigest, reviewedObservations } from '../packages/archive/report';
import { historyEvidence } from '../packages/domain/evidence';
import { archiveEvidence } from '../packages/domain/history-source';
import { dailyHistory } from '../packages/domain/daily-history';
import { weeklyHistory } from '../packages/domain/weekly-history';
import { eligible, evaluate, type Product } from '../packages/domain/index';
import { writeListingHistory as writeHistory } from '../packages/archive/write';

const ASIN = 'B09XS7JWHH';
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const writeListingHistory: typeof writeHistory = (client, listingId, productId, observations) =>
  writeHistory(client, listingId, productId, observations, NOW);
const W: Window = { from: NOW - 30 * 86400000, to: NOW, now: NOW, retentionDays: 30 };
const listing = {
  id: 'listing-sony',
  productId: 'amazon-b09xs7jwhh',
  store: 'Amazon' as const,
  externalId: ASIN,
};
const row = (over: Partial<CdxRow> = {}): CdxRow => ({
  timestamp: '20261020083015',
  original: `https://www.amazon.in/dp/${ASIN}`,
  statuscode: '200',
  mimetype: 'text/html',
  ...over,
});
const sonyAttrs = {
  Brand: 'Sony',
  'Model Number': 'WH-1000XM5',
  Color: 'Black',
  Connectivity: 'Wireless',
};
const amazonHtml = (
  o: {
    asin?: string;
    price?: string;
    stock?: string;
    attrs?: Record<string, string>;
    title?: string;
  } = {},
) => {
  const attrs = o.attrs ?? sonyAttrs;
  return `<html><head><title>Amazon.in</title></head><body>
<input type="hidden" id="ASIN" value="${o.asin ?? ASIN}">
<span id="productTitle">${o.title ?? 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones, Black'}</span>
${o.price === '' ? '' : `<div id="corePrice_desktop"><span class="a-price"><span class="a-offscreen">${o.price ?? '₹26,990'}</span></span></div>`}
${o.stock === '' ? '' : `<div id="availability">${o.stock ?? 'In stock'}</div>`}
${o.stock === '' ? '' : '<input id="add-to-cart-button">'}
<table id="productDetails_techSpec_section_1">${Object.entries(attrs)
    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
    .join('')}</table>
<p>Ships from and sold by a seller. Delivery details on checkout.</p>
</body></html>`;
};
const capture = () => {
  const v = validateCapture(row(), listing, W);
  if (!v.ok) throw new Error(v.reason);
  return v.capture;
};

describe('capture identity', () => {
  it('rejects another store or ASIN returned by a prefix search', () => {
    expect(
      validateCapture(row({ original: 'https://www.amazon.in/dp/B09XS7JWHJ' }), listing, W),
    ).toEqual({ ok: false, reason: 'wrong_listing' });
    expect(
      validateCapture(row({ original: 'https://www.amazon.in/dp/B09XS7JWHHX' }), listing, W),
    ).toEqual({ ok: false, reason: 'unsupported_url' });
    expect(
      validateCapture(
        row({ original: 'https://www.flipkart.com/x/p/itm123?pid=ABCDEFGHIJ' }),
        listing,
        W,
      ).ok,
    ).toBe(false);
    expect(validateCapture(row({ original: 'https://www.amazon.in/gp/help' }), listing, W)).toEqual(
      { ok: false, reason: 'unsupported_url' },
    );
  });
  it('identifies HTTP originals locally, without any request', () => {
    expect(identifyOriginal(`http://www.amazon.in:80/dp/${ASIN}`)).toMatchObject({
      store: 'Amazon',
      externalId: ASIN,
    });
    expect(identifyOriginal(`amazon.in/dp/${ASIN}/ref=x`)).toMatchObject({
      store: 'Amazon',
      externalId: ASIN,
    });
    expect(identifyOriginal(`http://www.amazon.in:8080/dp/${ASIN}`)).toBeNull();
    const v = validateCapture(row({ original: `http://www.amazon.in/dp/${ASIN}` }), listing, W);
    expect(v.ok && v.capture.originalUrl.startsWith('https://')).toBe(true);
    expect(v.ok && v.capture.rawUrl).toBe(
      `https://web.archive.org/web/20261020083015id_/http://www.amazon.in/dp/${ASIN}`,
    );
  });
  it('rejects non-200 and non-HTML captures', () => {
    expect(validateCapture(row({ statuscode: '301' }), listing, W)).toEqual({
      ok: false,
      reason: 'status_not_200',
    });
    expect(validateCapture(row({ mimetype: 'warc/revisit' }), listing, W)).toEqual({
      ok: false,
      reason: 'not_html',
    });
  });
});

describe('timestamps', () => {
  it('rejects malformed values JavaScript would normalize', () => {
    expect(parseCaptureTimestamp('20261020083015')).toBe(Date.UTC(2026, 9, 20, 8, 30, 15));
    for (const bad of [
      '20261301000000',
      '20260230120000',
      '20261020246000',
      '2026102008301',
      'abcd1020083015',
      '19950101000000',
      20261020083015,
    ])
      expect(parseCaptureTimestamp(bad)).toBeNull();
  });
  it('rejects invalid, future, out-of-range and expired captures', () => {
    expect(validateCapture(row({ timestamp: '20260231000000' }), listing, W)).toEqual({
      ok: false,
      reason: 'bad_timestamp',
    });
    expect(validateCapture(row({ timestamp: '20261029000000' }), listing, W)).toEqual({
      ok: false,
      reason: 'future_capture',
    });
    expect(validateCapture(row({ timestamp: '20260801000000' }), listing, W)).toEqual({
      ok: false,
      reason: 'outside_range',
    });
    const wide = { ...W, from: NOW - 60 * 86400000 };
    expect(validateCapture(row({ timestamp: '20260910000000' }), listing, wide)).toEqual({
      ok: false,
      reason: 'outside_retention',
    });
  });
});

describe('replay provenance', () => {
  const c = capture();
  it('refuses redirects to the live retailer, other listings or bad captures', () => {
    expect(followRedirect(`https://www.amazon.in/dp/${ASIN}`, c.rawUrl, listing, W)).toEqual({
      ok: false,
      reason: 'redirect_left_archive',
    });
    expect(
      followRedirect(`/web/20261020090000/https://www.amazon.in/dp/${ASIN}`, c.rawUrl, listing, W),
    ).toEqual({ ok: false, reason: 'redirect_not_raw_capture' });
    expect(
      followRedirect(
        '/web/20261020090000id_/https://www.amazon.in/dp/B000000000',
        c.rawUrl,
        listing,
        W,
      ),
    ).toEqual({ ok: false, reason: 'redirect_other_listing' });
    expect(
      followRedirect(
        `/web/20251020090000id_/https://www.amazon.in/dp/${ASIN}`,
        c.rawUrl,
        listing,
        W,
      ),
    ).toEqual({ ok: false, reason: 'outside_range' });
    expect(followRedirect(null, c.rawUrl, listing, W)).toEqual({
      ok: false,
      reason: 'redirect_bad_location',
    });
  });
  it('relabels a redirect to another capture with the time that capture proves', () => {
    const r = followRedirect(
      `/web/20261020090102id_/https://www.amazon.in/dp/${ASIN}`,
      c.rawUrl,
      listing,
      W,
    );
    expect(r.ok && r.capture.timestamp).toBe('20261020090102');
    expect(mementoMatches('Tue, 20 Oct 2026 08:30:15 GMT', c)).toBe(true);
    expect(mementoMatches('Tue, 20 Oct 2026 09:01:02 GMT', c)).toBe(false);
    expect(mementoMatches(null, c)).toBe(false);
  });
  it('never fetches a live host and does not date a redirected page with the requested time', async () => {
    const seen: string[] = [];
    const fake = (responses: Response[]) => async (url: string | URL | Request) => {
      seen.push(String(url));
      return responses.shift()!;
    };
    const client = (r: Response[]) =>
      new ArchiveClient({ fetch: fake(r) as typeof fetch, pauseMs: 0, sleep: async () => {} });
    const live = await replayCapture(
      client([
        new Response(null, {
          status: 302,
          headers: { location: `https://www.amazon.in/dp/${ASIN}` },
        }),
      ]),
      c,
      listing,
      W,
    );
    expect(live).toEqual({ ok: false, reason: 'redirect_left_archive' });
    expect(seen.every((u) => u.startsWith('https://web.archive.org/'))).toBe(true);
    const html = { 'content-type': 'text/html; charset=utf-8' };
    const moved = await replayCapture(
      client([
        new Response(null, {
          status: 302,
          headers: { location: `/web/20261020090102id_/https://www.amazon.in/dp/${ASIN}` },
        }),
        new Response(amazonHtml(), {
          headers: { ...html, 'memento-datetime': 'Tue, 20 Oct 2026 09:01:02 GMT' },
        }),
      ]),
      c,
      listing,
      W,
    );
    expect(moved.ok && moved.capture.timestamp).toBe('20261020090102');
    const wrongDate = await replayCapture(
      client([
        new Response(amazonHtml(), {
          headers: { ...html, 'memento-datetime': 'Mon, 19 Oct 2026 00:00:00 GMT' },
        }),
      ]),
      c,
      listing,
      W,
    );
    expect(wrongDate).toEqual({ ok: false, reason: 'memento_mismatch' });
  });
  it('bounds retries, honours Retry-After and caps response size', async () => {
    const waits: number[] = [];
    let calls = 0;
    const busy = new ArchiveClient({
      fetch: (async () => (
        calls++,
        new Response('slow down', { status: 429, headers: { 'retry-after': '7' } })
      )) as typeof fetch,
      pauseMs: 0,
      sleep: async (ms) => void waits.push(ms),
    });
    expect((await busy.get('https://web.archive.org/cdx/search/cdx', /json/)).kind).toBe('http');
    expect(calls).toBe(3);
    expect(waits).toContain(7000);
    const big = new ArchiveClient({
      fetch: (async () =>
        new Response('x'.repeat(2000), {
          headers: { 'content-type': 'text/html' },
        })) as typeof fetch,
      pauseMs: 0,
      maxBytes: 1000,
    });
    expect((await big.get('https://web.archive.org/web/1id_/x', /html/)).kind).toBe('too_large');
    expect((await big.get('https://www.amazon.in/dp/x', /html/)).kind).toBe('not_archive');
  });
});

describe('page outcomes', () => {
  const c = capture();
  it('keeps captcha, empty HTML, missing price, stock uncertainty and malformed CDX distinct', () => {
    expect(
      classifyPage(
        '<html><title>Robot Check</title><form action="/errors/validateCaptcha"></form><p>Enter the characters you see below</p></html>',
        c,
        listing,
      ).kind,
    ).toBe('captcha');
    expect(classifyPage('<html><body></body></html>', c, listing).kind).toBe('empty_html');
    expect(classifyPage(amazonHtml({ price: '' }), c, listing).kind).toBe('no_price');
    expect(classifyPage(amazonHtml({ stock: '' }), c, listing).kind).toBe('stock_unknown');
    expect(classifyPage(amazonHtml({ stock: 'Currently unavailable.' }), c, listing).kind).not.toBe(
      'parsed',
    );
    expect(classifyPage(amazonHtml({ asin: 'B000000000' }), c, listing).kind).toBe(
      'identity_mismatch',
    );
    expect(classifyPage(amazonHtml(), c, listing).kind).toBe('parsed');
    expect(parseCdx('<html>busy</html>').kind).toBe('malformed');
    expect(parseCdx('[["timestamp","original"],["1"]]').kind).toBe('malformed');
    expect(parseCdx('[]').kind).toBe('empty');
    expect(parseCdx('[["timestamp","original","statuscode","mimetype"]]').kind).toBe('empty');
    expect(
      parseCdx(
        JSON.stringify([['timestamp', 'original', 'statuscode', 'mimetype'], Object.values(row())]),
      ).kind,
    ).toBe('rows');
  });
  it('keeps unknown shipping null and the currency domestic INR', () => {
    const p = classifyPage(amazonHtml(), c, listing);
    if (p.kind !== 'parsed') throw new Error(p.kind);
    const o = buildObservation(listing, c, p.page, ['Brand'], 30);
    expect(o.offer.shipping).toBeNull();
    expect(o.offer.currency).toBe('INR');
    expect(() => buildObservation(listing, c, p.page, [], 30, 'USD')).toThrow('currency');
    expect(() =>
      buildObservation({ ...listing, store: 'B&H' as never }, c, p.page, [], 30),
    ).toThrow('cross-border');
  });
});

describe('exact variants', () => {
  const page = (attributes: Record<string, string>, title = 'Item') => ({
    title,
    attributes,
    condition: 'new',
  });
  it('rejects a different model, storage, pack, shade, binding or edition', () => {
    const phone = {
      title: 'Samsung Galaxy S24 5G (Onyx Black, 8GB, 256GB)',
      attributes: {
        Brand: 'Samsung',
        'Model Number': 'SM-S921B',
        RAM: '8 GB',
        Storage: '256 GB',
        Color: 'Onyx Black',
      },
    };
    expect(matchArchived(phone, page({ ...phone.attributes, Storage: '128 GB' })).decision).toBe(
      'rejected',
    );
    expect(
      matchArchived(phone, page({ ...phone.attributes, 'Model Number': 'SM-S926B' })).decision,
    ).toBe('rejected');
    expect(
      matchArchived(
        { title: 'Sony WH-1000XM5 Headphones', attributes: sonyAttrs },
        page({ ...sonyAttrs, 'Model Number': 'WH-1000XM4' }),
      ).decision,
    ).toBe('rejected');
    const lipstick = {
      title: 'Maybelline SuperStay Matte Ink Liquid Lipstick',
      attributes: { Brand: 'Maybelline', Shade: 'Pioneer', Size: '5 ml', GTIN: '6902395747683' },
    };
    expect(matchArchived(lipstick, page({ ...lipstick.attributes, Shade: 'Lover' })).decision).toBe(
      'rejected',
    );
    const book = {
      title: 'Atomic Habits Paperback',
      attributes: {
        GTIN: '9781847941831',
        Binding: 'paperback',
        Edition: '1st',
        Language: 'English',
      },
    };
    expect(
      matchArchived(
        book,
        page({ ...book.attributes, Binding: 'hardcover' }, 'Atomic Habits Hardcover'),
      ).decision,
    ).toBe('rejected');
    expect(matchArchived(book, page({ ...book.attributes, Edition: '2nd' })).decision).toBe(
      'rejected',
    );
    const pens = {
      title: 'Pilot V7 Pen Pack of 5',
      attributes: { Brand: 'Pilot', 'Model Number': 'V7', Pack: '5', Color: 'Blue' },
    };
    expect(
      matchArchived(pens, page({ ...pens.attributes, Pack: '10' }, 'Pilot V7 Pen Pack of 10'))
        .decision,
    ).toBe('rejected');
  });
  it('leaves missing decisive identity unverified', () => {
    expect(
      matchArchived({ title: 'Sony WH-1000XM5 Headphones', attributes: {} }, page(sonyAttrs))
        .decision,
    ).toBe('unverified');
    expect(
      matchArchived(
        { title: 'Sony WH-1000XM5 Headphones', attributes: sonyAttrs },
        page({ Brand: 'Sony' }),
      ).decision,
    ).toBe('unverified');
    expect(
      matchArchived({ title: 'Sony WH-1000XM5 Headphones', attributes: sonyAttrs }, page(sonyAttrs))
        .decision,
    ).toBe('accepted');
  });
});

describe('history-only writes', () => {
  const db = new PGlite();
  const query = async (sql: string, params: unknown[] = []) => {
    const r = await db.query(
      sql,
      params.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v)),
    );
    return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
  };
  beforeAll(async () => {
    const dir = new URL('../packages/database/migrations/', import.meta.url);
    for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(f, dir), 'utf8'));
    await query(
      "INSERT INTO atlas.products(id,slug,data,created_at) VALUES('amazon-b09xs7jwhh','sony-xm5','{}',0)",
    );
    await query(
      "INSERT INTO atlas.listings(id,product_id,store,external_id,url,evidence,next_check) VALUES('listing-sony','amazon-b09xs7jwhh','Amazon',$1,$2,$3,0)",
      [
        ASIN,
        `https://www.amazon.in/dp/${ASIN}`,
        { title: 'Sony WH-1000XM5', attributes: sonyAttrs, condition: 'new' },
      ],
    );
  });
  it('an exact dated fixture becomes one idempotent history-only observation with evidence', async () => {
    const c = capture();
    const p = classifyPage(amazonHtml(), c, listing);
    if (p.kind !== 'parsed') throw new Error(p.kind);
    const m = matchArchived(
      { title: 'Sony WH-1000XM5', attributes: sonyAttrs, condition: 'new' },
      p.page,
    );
    expect(m.decision).toBe('accepted');
    const o = buildObservation(listing, c, p.page, m.checked, 30);
    expect(o.id).toBe(`wayback:listing-sony:20261020083015`);
    expect(o.observedAt).toBe(Date.UTC(2026, 9, 20, 8, 30, 15));
    expect(o.offer).toMatchObject({
      itemPrice: 2699000,
      alertsAllowed: false,
      displayAllowed: false,
      historyAllowed: true,
      validUntil: o.observedAt,
      context: 'Internet Archive snapshot',
      evidence: {
        extraction: 'archived retailer HTML',
        parserVersion: 'retailer-html-v2',
        originalUrl: `https://www.amazon.in/dp/${ASIN}`,
        archiveUrl: `https://web.archive.org/web/20261020083015/https://www.amazon.in/dp/${ASIN}`,
        verifiedLiveByPriceAtlas: false,
      },
    });
    const first = await writeListingHistory({ query }, 'listing-sony', 'amazon-b09xs7jwhh', [o]);
    const again = await writeListingHistory({ query }, 'listing-sony', 'amazon-b09xs7jwhh', [o]);
    expect(first).toMatchObject({ inserted: 1, duplicates: 0 });
    expect(again).toMatchObject({ inserted: 0, duplicates: 1 });
    expect((await query('SELECT count(*)::int n FROM atlas.observations')).rows[0].n).toBe(1);
    expect((await query('SELECT count(*)::int n FROM atlas.current_offers')).rows[0].n).toBe(0);
    expect((await query('SELECT count(*)::int n FROM atlas.notifications')).rows[0].n).toBe(0);
    const stored = (await query('SELECT data FROM atlas.observations')).rows[0].data;
    expect(stored.alertsAllowed).toBe(false);
    expect(stored.shipping).toBeNull();
  });
  it('refuses a listing that moved product or is no longer accepted', async () => {
    const o = buildObservation(
      listing,
      capture(),
      (classifyPage(amazonHtml(), capture(), listing) as any).page,
      [],
      30,
    );
    expect((await writeListingHistory({ query }, 'listing-sony', 'other-product', [o])).error).toBe(
      'listing_moved',
    );
    await query("UPDATE atlas.listings SET match_state='review' WHERE id='listing-sony'");
    expect(
      (await writeListingHistory({ query }, 'listing-sony', 'amazon-b09xs7jwhh', [o])).error,
    ).toBe('listing_not_accepted');
    await query("UPDATE atlas.listings SET match_state='accepted' WHERE id='listing-sony'");
  });
  it('does not add an archive point on a day that already has our own observation', async () => {
    const result = validateCapture(row({ timestamp: '20261021083015' }), listing, W);
    if (!result.ok) throw new Error(result.reason);
    const c = result.capture;
    await query(
      "INSERT INTO atlas.observations(id,product_id,listing_id,run_key,data,observed_at,expires_at) VALUES('own','amazon-b09xs7jwhh','listing-sony','run-own','{}',$1,$2)",
      [c.observedAt + 3600000, c.observedAt + 9e9],
    );
    const o = buildObservation(
      listing,
      c,
      (classifyPage(amazonHtml(), c, listing) as any).page,
      ['Brand'],
      30,
    );
    expect(
      (await writeListingHistory({ query }, 'listing-sony', 'amazon-b09xs7jwhh', [o])).skipped,
    ).toEqual({ primary_observation_exists: 1 });
  });
});

describe('reachability', () => {
  const client = (f: typeof fetch) =>
    new ArchiveClient({ fetch: f, pauseMs: 0, sleep: async () => {} });
  it('a successful empty CDX answer differs from an unreachable archive', async () => {
    const json = { 'content-type': 'application/json' };
    expect(
      await probeArchive(
        client((async () => new Response('[]', { headers: json })) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: true, result: 'empty' });
    expect(
      await probeArchive(
        client((async () => {
          throw new TypeError('fetch failed');
        }) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'network' });
    expect(
      await probeArchive(
        client((async () => {
          throw Object.assign(new Error('t'), { name: 'TimeoutError' });
        }) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'timeout' });
    expect(
      await probeArchive(
        client((async () => new Response('no', { status: 403 })) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'forbidden' });
    expect(
      await probeArchive(
        client((async () => new Response('no', { status: 429 })) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'rate_limited' });
    expect(
      await probeArchive(
        client((async () => new Response('no', { status: 503 })) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'server_error' });
    expect(
      await probeArchive(
        client((async () => new Response('<html>', { headers: json })) as typeof fetch),
        NOW,
      ),
    ).toMatchObject({ reachable: false, result: 'malformed' });
  });
});

describe('archive integration safeguards', () => {
  const p = classifyPage(amazonHtml(), capture(), listing);
  if (p.kind !== 'parsed') throw new Error(p.kind);
  const o = buildObservation(listing, capture(), p.page, ['Brand', 'Model Number'], 30);
  it('rechecks the saved envelope, exact listing, expiry, flags, and price before any insert', () => {
    expect(historyWriteRejection(o, listing, NOW, 30)).toBeNull();
    for (const mutate of [
      (v: typeof o) => {
        v.offer.alertsAllowed = true;
      },
      (v: typeof o) => {
        v.offer.displayAllowed = true;
      },
      (v: typeof o) => {
        v.offer.historyAllowed = false;
      },
      (v: typeof o) => {
        v.offer.itemPrice = -1;
      },
      (v: typeof o) => {
        v.offer.shipping = -1;
      },
      (v: typeof o) => {
        v.offer.productId = 'other';
      },
      (v: typeof o) => {
        v.offer.observedAt++;
      },
      (v: typeof o) => {
        v.offer.evidence.rawArchiveUrl = 'https://www.amazon.in/dp/' + ASIN;
      },
      (v: typeof o) => {
        v.offer.evidence.captureTimestamp = '20261021083015';
      },
      (v: typeof o) => {
        v.offer.evidence.matchedAttributes = [];
      },
      (v: typeof o) => {
        v.expiresAt = NOW - 1;
      },
    ]) {
      const corrupted = structuredClone(o);
      mutate(corrupted);
      expect(historyWriteRejection(corrupted, listing, NOW, 30)).not.toBeNull();
    }
    expect(
      historyWriteRejection(o, { ...listing, externalId: 'B000000000' }, NOW, 30),
    ).not.toBeNull();
    expect(historyWriteRejection(o, listing, NOW, 7)).not.toBeNull();
  });
  it('requires the latest matching intact report, and refuses failed, index-only, changed and expired runs', () => {
    const saved = {
      mode: 'validated',
      generatedAt: new Date(NOW).toISOString(),
      observations: [o],
      observationsSha256: observationsDigest([o]),
    };
    const latest = {
      mode: 'validated',
      generatedAt: saved.generatedAt,
      totals: { acceptedObservations: 1 },
      observationsSha256: saved.observationsSha256,
    };
    expect(reviewedObservations(saved, latest, NOW)).toEqual([o]);
    expect(() =>
      reviewedObservations(saved, { ...latest, stopped: 'archive_unreachable' }, NOW),
    ).toThrow();
    expect(() => reviewedObservations(saved, { ...latest, mode: 'index-only' }, NOW)).toThrow();
    expect(() =>
      reviewedObservations(
        saved,
        { ...latest, generatedAt: new Date(NOW + 1000).toISOString() },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      reviewedObservations({ ...saved, observations: [{ ...o, productId: 'other' }] }, latest, NOW),
    ).toThrow();
    expect(() => reviewedObservations(saved, latest, NOW + 48 * 3600000)).toThrow();
    expect(() => reviewedObservations(saved, { mode: 'pending' }, NOW)).toThrow();
  });
  it('labels exported captures with archive and original URLs instead of claiming a live check', () => {
    const product = { id: listing.productId, name: 'Sony WH-1000XM5' } as Product;
    const csv = historyEvidence(product, [o.offer], 'item', NOW);
    expect(csv).toContain('Original retailer URL');
    expect(csv).toContain(o.offer.evidence.archiveUrl);
    expect(csv).toContain(o.offer.evidence.originalUrl);
    expect(csv).toContain('Internet Archive capture; not a live Price Atlas check');
    expect(csv).toContain('archived retailer HTML');
    expect(csv).not.toContain('Recorded observation; verify at checkout');
    expect(archiveEvidence({ ...o.offer, source: undefined })).toBeNull();
    expect(
      archiveEvidence({
        ...o.offer,
        evidence: { ...o.offer.evidence, archiveUrl: 'javascript:alert(1)' },
      }),
    ).toBeNull();
  });
  it('carries evidence to plotted prices without filling gaps or admitting captures to current rankings and alerts', () => {
    const days = dailyHistory([o.offer], 'item', 30, NOW);
    expect(days.filter((d) => d.price !== null)).toEqual([
      { price: o.offer.itemPrice, observations: [o.offer] },
    ]);
    expect(eligible(o.offer, o.observedAt)).toBe(false);
    const rule = {
      id: 'r',
      productId: listing.productId,
      target: 99999999,
      operator: 'lte' as const,
      basis: 'item' as const,
      store: 'all' as const,
      enabled: true,
      version: 1,
      episode: 0,
      activeEpisode: false,
      aboveCount: 0,
      lastTriggeredAt: null,
    };
    expect(evaluate(rule, [o.offer], NOW).trigger).toBeNull();
    const week = weeklyHistory([o.offer], 'item', o.observedAt + 86400000);
    expect(week.flatMap((d) => d.archivePoints)).toEqual([o.offer]);
    expect(week.filter((d) => d.low !== null)).toHaveLength(1);
  });
  it('treats an empty HTTP body as malformed, not proof of zero coverage', () => {
    expect(parseCdx('  ').kind).toBe('malformed');
  });
});
