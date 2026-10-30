'use client';
// The home page "worlds" from the Price Atlas design canvas (Main.dc.html), wired to real data.
// Each section keeps the sketch's markup and classes; styles live in app/home-sketch.css under `.hs`.
import { sizedImage } from '../../../packages/domain/image-size';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { eligible, money, rank, total, type Offer, type Product, type Rule } from '@domain/index';
import { retailers } from '../../../packages/domain/retailers';
import { weeklyHistory } from '../../../packages/domain/weekly-history';
import { HistoryCitation } from './history-citation';
import { TidesWorld } from './tides-world';
import { fetchJson } from '../lib/fetch-json';
import { historyCoverage } from '../../../packages/domain/history-coverage';
import { ExternalHistory } from './external-history';
import { reducedMotion } from './three-loader';
import { OfferEvidence } from './offer-evidence';
export type PinDraft = {
  productId: string;
  target?: number;
  store?: string;
  basis?: Basis;
  id?: string;
};

type Basis = 'delivered' | 'item';
type Watch = { id: string; product_id: string; collection: string };
type Note = {
  id: string;
  productId: string;
  price: number;
  store: string;
  state: string;
  created_at: number;
  title: string;
};

const ICONS: Record<string, string> = {
  phones: 'M19 6h10a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4zM21 37h6',
  laptops: 'M12 10h24a2 2 0 0 1 2 2v17H10V12a2 2 0 0 1 2-2zM5 33h38l-3 5H8z',
  tablets: 'M13 8h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4zM23 35h2',
  audio:
    'M10 28v-4a14 14 0 0 1 28 0v4M10 27h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM34 27h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
  monitors:
    'M8 9h32a2 2 0 0 1 2 2v19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM18 40h12M24 32v8',
  beauty: 'M17 26h14v16H17zM19 26V15l10-6v17',
  'personal-care':
    'M20 16h8a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5zM20 16v-5h8v5M15 28h18',
  'home-kitchen': 'M9 26a11 11 0 1 0 22 0a11 11 0 1 0-22 0M31 26h12',
  appliances: 'M14 18h18l3 22H11zM32 22c6 0 7 9 1 11M18 18c0-6 10-6 10 0',
  accessories: 'M24 8a9 9 0 0 1 9 9v14a9 9 0 0 1-18 0V17a9 9 0 0 1 9-9zM24 8v10',
  fashion: 'M17 8l-9 6 4 7 4-2v21h16V19l4 2 4-7-9-6c-1 3-4 5-7 5s-6-2-7-5z',
  books: 'M10 9h12a4 4 0 0 1 4 4v27a3 3 0 0 0-3-3H10zM38 9H26v31a3 3 0 0 1 3-3h9z',
  stationery:
    'M14 6h20a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM16 10h16v8H16z',
  services: 'M24 6l14 5v11c0 9-6 15-14 19C16 37 10 31 10 22V11z',
  other: 'M8 16l16-8 16 8v18l-16 8-16-8zM8 16l16 8 16-8M24 24v18',
};
const CAT: Record<string, string> = {
  phones: 'Phones',
  laptops: 'Laptops',
  tablets: 'Tablets',
  audio: 'Audio',
  monitors: 'Monitors',
  beauty: 'Beauty',
  'personal-care': 'Skin & hair',
  'home-kitchen': 'Home & kitchen',
  appliances: 'Appliances',
  accessories: 'Accessories',
  fashion: 'Fashion',
  books: 'Books',
  stationery: 'Stationery',
  services: 'Services',
  other: 'Other',
};
const FILLS = ['pink', 'lime', 'ink'];
const fmt = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(paise / 100);
const storeLabel = (s: string) => (s === 'Amazon' ? 'Amazon.in' : s);
const tint = (s: string) => 's-' + s.toLowerCase().replace(/[^a-z]/g, '');
const short = (p: Product) => {
  const words = p.name.replace(p.brand, '').trim().split(/\s+/).slice(0, 3).join(' ');
  return words || p.name.split(/\s+/).slice(0, 3).join(' ');
};
function ago(at: number) {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
const lowest = (list: Offer[], basis: Basis = 'delivered') => rank(list, Date.now(), basis).lowest;

// ---------------------------------------------------------------------------
// Every offer, side by side.
// ---------------------------------------------------------------------------
function OffersWorld({ products, offers }: { products: Product[]; offers: Offer[] }) {
  const candidates = useMemo(
    () =>
      products
        .map((p) => ({ p, list: offers.filter((o) => o.productId === p.id && o.displayAllowed) }))
        .filter((x) => new Set(x.list.map((o) => o.store)).size >= 2)
        .sort((a, b) => b.list.length - a.list.length)
        .slice(0, 4),
    [products, offers],
  );
  const [pick, setPick] = useState(0);
  const [sort, setSort] = useState<'delivered' | 'item' | 'fresh'>('delivered');
  const [domestic, setDomestic] = useState(false);
  const [hideUnranked, setHideUnranked] = useState(false);
  const active = candidates[Math.min(pick, candidates.length - 1)];
  if (!active)
    return (
      <section className="wa">
        <div className="wrap">
          <div className="wa-head rv">
            <div>
              <h2>Every offer, side by side.</h2>
              <p>
                Once two stores list the same exact product, their tickets line up here. Search a
                product to start the table.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  // one ticket per store: its most recent observation
  const byStore = new Map<string, Offer>();
  for (const o of [...active.list].sort((a, b) => b.observedAt - a.observedAt))
    if (!byStore.has(o.store)) byStore.set(o.store, o);
  const list = [...byStore.values()];
  const basis: Basis = sort === 'item' ? 'item' : 'delivered';
  const intl = (o: Offer) => retailers[o.store]?.international || o.currency !== 'INR';
  const rankable = (o: Offer) => !intl(o) && o.accepted && eligible(o) && total(o, basis) !== null;
  const val = (o: Offer) => total(o, basis) as number;
  const order = list
    .filter(rankable)
    .sort(sort === 'fresh' ? (a, b) => b.observedAt - a.observedAt : (a, b) => val(a) - val(b));
  const rest = list.filter((o) => !rankable(o));
  const visible = order
    .concat(
      rest.filter((o) => o.accepted && !intl(o)),
      rest.filter((o) => !o.accepted),
      rest.filter((o) => o.accepted && intl(o)),
    )
    .filter((o) => !(domestic && intl(o)) && !(hideUnranked && !rankable(o)));
  const cheap = order.length ? Math.min(...order.map(val)) : 0;
  const dear = order.length ? Math.max(...order.map(val)) : 0;
  const tickets = list.map((o) => {
    const vi = visible.indexOf(o);
    const shown = vi >= 0;
    const pos = shown ? vi : 0;
    const ri = order.indexOf(o);
    let cls = `tk ${tint(o.store)} p${pos} o${pos}${shown ? '' : ' gone'}`;
    let fig: string, stat: string, statCls: string, rankLabel: string;
    if (ri >= 0) {
      const v = val(o);
      fig = '₹' + fmt(v);
      rankLabel = order.length === 1 ? 'recorded' : 'no. ' + (ri + 1);
      const top = sort === 'fresh' ? ri === 0 : v === cheap;
      stat =
        order.length === 1
          ? '1 recorded offer'
          : sort === 'fresh'
            ? ri === 0
              ? 'checked most recently'
              : 'checked ' + ago(o.observedAt)
            : top
              ? sort === 'item'
                ? 'lowest item price'
                : 'lowest, exact'
              : '+₹' + fmt(v - cheap);
      statCls = top && order.length > 1 ? 'stp win' : 'stp plain';
      if (top && order.length > 1) cls += ' win';
    } else if (intl(o)) {
      cls += ' gate';
      fig = 'no INR price';
      stat = 'kept in ' + o.currency;
      statCls = 'stp gate';
      rankLabel = 'international';
    } else if (!o.accepted) {
      cls += ' out';
      fig = 'not this product';
      stat = 'variant did not match';
      statCls = 'stp bad';
      rankLabel = 'rejected';
    } else {
      cls += ' out';
      fig = o.stock ? 'waiting' : 'out of stock';
      stat = !o.stock
        ? 'not available now'
        : o.shipping === null
          ? 'delivery unknown'
          : 'too old to rank';
      statCls = 'stp plain';
      rankLabel = 'unranked';
    }
    return { o, cls, shown, fig, stat, statCls, rankLabel, isR: ri >= 0 };
  });
  return (
    <section className="wa">
      <div className="wrap">
        <div className="wa-head rv">
          <div>
            <h2>Every offer, side by side.</h2>
            <p>
              Sort by what matters to you. Tickets that can’t be ranked stay on the table with their
              reason.
            </p>
          </div>
          <div className="plate">
            now comparing <b>{active.p.name}</b>
          </div>
        </div>
        <div className="tbar">
          <div className="seg2" role="group" aria-label="Sort offers">
            {(
              [
                ['delivered', 'Cheapest delivered'],
                ['item', 'Cheapest item price'],
                ['fresh', 'Checked most recently'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={sort === v ? 'on' : ''}
                aria-pressed={sort === v}
                onClick={() => setSort(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="tog">
            {(
              [
                ['domestic', 'Indian stores only', domestic, setDomestic],
                ['hide', 'Hide unranked', hideUnranked, setHideUnranked],
              ] as const
            ).map(([k, l, on, set]) => (
              <button
                key={k}
                type="button"
                className={on ? 'on' : ''}
                aria-pressed={on}
                onClick={() => set(!on)}
              >
                <i aria-hidden="true"></i>
                {l}
              </button>
            ))}
          </div>
        </div>
        {candidates.length > 1 && (
          <div className="tbar">
            <div className="seg2" role="group" aria-label="Product to compare">
              {candidates.map((c, i) => (
                <button
                  key={c.p.id}
                  type="button"
                  className={c === active ? 'on' : ''}
                  aria-pressed={c === active}
                  onClick={() => setPick(i)}
                >
                  {short(c.p)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={'tickets h' + Math.min(6, visible.length)}>
          {tickets.map((t) => (
            <article key={t.o.id} className={t.cls} aria-hidden={!t.shown}>
              <div className="stub">
                <span className="sn">{storeLabel(t.o.store)}</span>
                <span className="no">{t.rankLabel}</span>
              </div>
              <div className="body">
                <span className="ev">
                  recorded product page{t.o.context ? ` · ${t.o.context.toLowerCase()}` : ''}
                </span>
                <dl>
                  <dt>Item</dt>
                  <dd>
                    {intl(t.o)
                      ? `${(t.o.itemPrice / 100).toFixed(2)} ${t.o.currency}`
                      : '₹' + fmt(t.o.itemPrice)}
                  </dd>
                  <dt>Seller</dt>
                  <dd>{t.o.seller || 'not stated'}</dd>
                  <dt>Delivery</dt>
                  <dd>
                    {intl(t.o)
                      ? 'import fees extra'
                      : t.o.shipping === null
                        ? 'not stated'
                        : t.o.shipping
                          ? '₹' + fmt(t.o.shipping)
                          : 'free, stated'}
                  </dd>
                  <dt>Checked</dt>
                  <dd>{ago(t.o.observedAt)}</dd>
                </dl>
              </div>
              <div className="pr">
                <span className="fig">
                  {t.isR
                    ? t.fig.split('').map((ch, j) => (
                        <span key={j} className={'fl q' + Math.min(9, j)}>
                          {ch}
                        </span>
                      ))
                    : t.fig}
                </span>
                <span className={t.statCls}>{t.stat}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="dimln">
          <span>₹{order.length ? fmt(cheap) : '—'}</span>
          <i></i>
          <span>₹{order.length ? fmt(dear) : '—'}</span>
          <span>
            {!order.length
              ? 'nothing ranked here yet'
              : order.length === 1
                ? `1 recorded ${basis} offer; no multi-store price comparison yet`
                : basis === 'item'
                  ? 'item prices only, delivery not added'
                  : `you save ₹${fmt(dear - cheap)} against the dearest ranked offer`}
          </span>
        </div>
        <div className="offer-evidence-list">
          {list.map((offer) => (
            <OfferEvidence key={offer.id} offer={offer} basis={basis} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stick it on the fridge. (the watchlist as postcards)
// ---------------------------------------------------------------------------
function FridgeWorld({
  products,
  offers,
  watches,
  rules,
  onSave,
}: {
  products: Product[];
  offers: Offer[];
  watches: Watch[];
  rules: Rule[];
  onSave: (p: Product) => void;
}) {
  const saved = watches
    .map((w) => products.find((p) => p.id === w.product_id))
    .filter((p): p is Product => Boolean(p));
  const addable = products
    .filter((p) => !saved.includes(p) && offers.some((o) => o.productId === p.id))
    .slice(0, 3);
  return (
    <section className="st" id="watch">
      <div className="wrap">
        <div className="st-head rv">
          <h2>Stick it on the fridge.</h2>
          <p>Save what you are waiting on. Each one is a postcard you can peel off.</p>
        </div>
        <div className="cards">
          {saved.map((p, i) => {
            const lo = lowest(offers.filter((o) => o.productId === p.id));
            const watching = rules.some((r) => r.productId === p.id && r.enabled);
            return (
              <article key={p.id} className={'pc t' + ((i % 4) + 1)}>
                <button
                  type="button"
                  className="rm"
                  aria-label={'Remove ' + p.name}
                  onClick={() => onSave(p)}
                >
                  ×
                </button>
                <span className="stampy">{watching ? 'watching' : 'saved'}</span>
                <i className="pinh" aria-hidden="true"></i>
                <div className={'fill ' + FILLS[i % FILLS.length]}>
                  <span className="pct">{CAT[p.category] || p.category}</span>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="pcimg"
                      src={sizedImage(p.imageUrl, 160)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <svg viewBox="0 0 48 48" aria-hidden="true">
                      <path d={ICONS[p.category] || ICONS.other}></path>
                    </svg>
                  )}
                </div>
                <Link prefetch={false} className="nm" href={`/p/${p.slug}`}>
                  {p.name}
                </Link>
                <span className="meta">{p.subtitle || p.brand}</span>
                <span className="price">{lo == null ? 'no current price' : '₹' + fmt(lo)}</span>
              </article>
            );
          })}
          <div className="add">
            <p>{saved.length ? 'Add a postcard' : 'Your fridge is empty. Add a postcard'}</p>
            <div className="opts">
              {addable.map((p) => (
                <button key={p.id} type="button" onClick={() => onSave(p)}>
                  + {short(p)}
                </button>
              ))}
            </div>
            {!addable.length && (
              <span style={{ fontSize: 14, color: 'var(--st-muted)' }}>
                Everything here is saved.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pin a target (pasteup)
// ---------------------------------------------------------------------------
function TargetsWorld({
  products,
  offers,
  watches,
  rules,
  onPin,
  initialTarget,
}: {
  products: Product[];
  offers: Offer[];
  watches: Watch[];
  rules: Rule[];
  onPin: (
    p: Product,
    rupees: number,
    store: string,
    basis: Basis,
    ruleId?: string,
  ) => Promise<boolean>;
  initialTarget?: PinDraft;
}) {
  const pool = useMemo(() => {
    const saved = watches
      .map((w) => products.find((p) => p.id === w.product_id))
      .filter((p): p is Product => Boolean(p));
    const domestic = products.filter(
      (p) =>
        !p.attributes['Source currency'] &&
        !retailers[p.attributes.Retailer as keyof typeof retailers]?.international,
    );
    const selected = domestic.find((p) => p.id === initialTarget?.productId);
    const domesticIds = new Set(domestic.map((p) => p.id));
    return [
      ...new Map(
        [
          ...saved.filter((p) => domesticIds.has(p.id)).slice(0, 8),
          ...(selected ? [selected] : domestic.slice(0, 1)),
        ].map((p) => [p.id, p]),
      ).values(),
    ];
  }, [products, watches, initialTarget?.productId]);
  const [choices, setChoices] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStatus, setPickerStatus] = useState('');
  const [pickerVersion, setPickerVersion] = useState(0);
  const [pickerError, setPickerError] = useState(false);
  const available = [
    ...new Map(
      [...pool, ...(selectedProduct ? [selectedProduct] : []), ...choices].map((p) => [p.id, p]),
    ).values(),
  ];
  const [selectedId, setSelectedId] = useState(initialTarget?.productId || pool[0]?.id || '');
  const [filter, setFilter] = useState('');
  const p = available.find((q) => q.id === selectedId) || pool[0];
  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    setPickerError(false);
    setPickerStatus('Loading recorded products…');
    const timer = setTimeout(() => {
      void fetchJson<{ products: Product[] }>(
        `/api/v1/suggestions?q=${encodeURIComponent(filter)}&domestic=1`,
        { signal: controller.signal },
      )
        .then((result) => {
          setChoices(result.products);
          setPickerStatus(
            result.products.length ? '' : 'No recorded product matched. Search or import it first.',
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setPickerError(true);
            setPickerStatus(
              error instanceof Error
                ? error.message
                : 'Unable to load products. Refocus the search to retry.',
            );
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickerOpen, filter, pickerVersion]);
  const pOffers = p ? offers.filter((o) => o.productId === p.id) : [];
  const suggested = (q?: Product) => {
    if (!q) return 0;
    const lo = lowest(
      offers.filter((o) => o.productId === q.id),
      'item',
    );
    return lo === null ? 0 : Math.max(1, Math.floor(lo * 0.95) / 100);
  };
  const [dt, setDt] = useState<string | null>(
    initialTarget?.target == null ? null : String(initialTarget.target / 100),
  );
  const [ds, setDs] = useState('all');
  const [db, setDb] = useState<Basis>('item');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const amount = dt ?? String(suggested(p) || '');
  const stores = [
    'all',
    ...new Set(pOffers.filter((o) => !retailers[o.store].international).map((o) => o.store)),
  ];
  useEffect(() => {
    if (initialTarget) {
      setSelectedId(initialTarget.productId);
      setDt(initialTarget.target == null ? null : String(initialTarget.target / 100));
      setDs(initialTarget.store || 'all');
      setDb(initialTarget.basis || 'item');
      setFeedback('');
      document
        .getElementById('targets')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }, [
    initialTarget?.productId,
    initialTarget?.target,
    initialTarget?.id,
    initialTarget?.store,
    initialTarget?.basis,
  ]);
  return (
    <section className="pu" id="targets">
      <div className="wrap">
        <div className="pu-head rv">
          <h2>Pin a target</h2>
          <p>
            Choose any saved product, pin your price, and follow fresh matching checks. Collection
            depends on source availability.
          </p>
        </div>
        <div className="pu-grid">
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!p || saving) return;
              setSaving(true);
              setFeedback('Pinning your target…');
              try {
                const saved = await onPin(
                  p,
                  Number(amount),
                  ds,
                  db,
                  initialTarget?.productId === p.id ? initialTarget.id : undefined,
                );
                setFeedback(
                  saved
                    ? 'Target pinned. Your saved note is on the board.'
                    : 'Your draft is ready. Sign in to finish pinning it.',
                );
              } catch (error) {
                setFeedback(
                  error instanceof Error
                    ? error.message
                    : 'Could not pin this target. Please retry.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <label htmlFor="pu-tgt">Alert me at or below</label>
            <div className="in">
              <span>₹</span>
              <input
                id="pu-tgt"
                type="number"
                inputMode="decimal"
                min="1"
                max="100000000"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setDt(e.target.value)}
              />
            </div>
            <label htmlFor="pin-product-search">Find a product</label>
            <input
              id="pin-product-search"
              type="search"
              value={filter}
              placeholder="Model, brand or product name"
              onFocus={() => setPickerOpen(true)}
              onChange={(event) => setFilter(event.target.value)}
            />
            <label htmlFor="pin-product">Product</label>
            <select
              id="pin-product"
              onFocus={() => setPickerOpen(true)}
              value={p?.id || ''}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSelectedProduct(available.find((product) => product.id === event.target.value));
                setDt(null);
                setDs('all');
                setFeedback('');
              }}
            >
              {available
                .filter(
                  (q) =>
                    q.id === p?.id ||
                    `${q.name} ${q.brand}`.toLowerCase().includes(filter.toLowerCase()),
                )
                .slice(0, 25)
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
            </select>
            {pickerError && (
              <button
                type="button"
                className="text-button"
                onClick={() => setPickerVersion((version) => version + 1)}
              >
                Retry product list
              </button>
            )}
            <p className="note" role="status">
              {pickerStatus ||
                (pickerOpen
                  ? 'Up to 24 recorded matches; type to narrow the list.'
                  : 'The product list loads when you open or search it.')}
            </p>
            {!pool.length && <p className="note">Search a domestic product first.</p>}
            <span className="lbl">Stores</span>
            <div className="seg" role="group" aria-label="Stores">
              {stores.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={ds === s ? 'on' : ''}
                  aria-pressed={ds === s}
                  onClick={() => setDs(s)}
                >
                  {s === 'all' ? 'All' : storeLabel(s)}
                </button>
              ))}
            </div>
            <span className="lbl">Price basis</span>
            <div className="seg" role="group" aria-label="Price basis">
              {(
                [
                  ['delivered', 'Delivered'],
                  ['item', 'Item only'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={db === v ? 'on' : ''}
                  aria-pressed={db === v}
                  onClick={() => setDb(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="note">Use item price when a store does not state delivery.</p>
            <p role="status" aria-live="polite" className="note">
              {feedback}
            </p>
            <button className="pin" type="submit" disabled={!p || saving}>
              {saving
                ? 'Pinning…'
                : initialTarget?.id && initialTarget.productId === p?.id
                  ? 'Update pinned target'
                  : 'Pin it'}
            </button>
          </form>
          <div className="sheets">
            {rules
              .slice()
              .reverse()
              .slice(0, 4)
              .map((r, i) => {
                const q = products.find((x) => x.id === r.productId);
                const scoped = offers.filter(
                  (o) => o.productId === r.productId && (r.store === 'all' || o.store === r.store),
                );
                const now = lowest(scoped, r.basis);
                const met = now != null && now <= r.target;
                return (
                  <article key={r.id} className={'sheet k' + ((i % 3) + 1)}>
                    <div className="tg">₹{fmt(r.target)}</div>
                    <div className="nm">{q?.name || 'Saved product'}</div>
                    <dl>
                      <dt>Stores</dt>
                      <dd>{r.store === 'all' ? 'all stores' : storeLabel(r.store)}</dd>
                      <dt>Basis</dt>
                      <dd>{r.basis === 'delivered' ? 'delivered price' : 'item price'}</dd>
                      <dt>Checked</dt>
                      <dd>hourly, on data under 1 h old</dd>
                      <dt>Today</dt>
                      <dd>{now == null ? 'no fresh price' : '₹' + fmt(now)}</dd>
                    </dl>
                    <span className={met ? 'state met' : 'state wait'}>
                      {!r.enabled
                        ? 'paused'
                        : met
                          ? 'met, alert queued'
                          : now == null
                            ? 'waiting for a fresh check'
                            : `₹${fmt(now - r.target)} to go`}
                    </span>
                  </article>
                );
              })}
            {!rules.length && (
              <article className="sheet k1">
                <div className="tg">₹ —</div>
                <div className="nm">No targets pinned yet</div>
                <dl>
                  <dt>How</dt>
                  <dd>pick a product, name a price, press Pin it</dd>
                  <dt>Checked</dt>
                  <dd>hourly, on data under 1 h old</dd>
                </dl>
                <span className="state wait">nothing pinned</span>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// This week, day by day (dose tray + receipt), budget strip and catalog progress
// ---------------------------------------------------------------------------
function WeekWorld({
  product,
  obs,
  basis,
}: {
  product: Product | null;
  obs: Offer[];
  basis: Basis;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const week = useMemo(() => (mounted ? weeklyHistory(obs, basis) : []), [obs, mounted, basis]);
  const last = week
    .map((d, i) => (d.low ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  const [sel, setSel] = useState<number | null>(null);
  const wsel = sel ?? last ?? 6;
  const [status, setStatus] = useState<{
    total: number;
    verified: number;
    pending: number;
    target: number;
    checkedAt: number;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/catalog/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.expansion)
          setStatus({
            total: j.products,
            verified: j.expansion.verifiedBaseProducts,
            pending: j.expansion.pendingBaseProducts,
            target: j.expansion.target,
            checkedAt: j.checkedAt,
          });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = week[wsel];
  const dateOf = (d: Date) => `${MN[d.getMonth()]} ${d.getDate()}`;
  return (
    <section className="do">
      <div className="wrap">
        <div className="do-head rv">
          <h2>This week, day by day.</h2>
          <p>
            Seven compartments, one per day of tracking
            {product ? ` for the ${product.name}` : ''}. Green means the lowest price fell that day,
            red means it rose. Pick a day to read its receipt.
          </p>
        </div>
        {mounted && week.length === 7 && (
          <div className="do-grid">
            <div className="tray" role="group" aria-label="Last seven days">
              {week.map((d, i) => {
                const tone =
                  d.change === null || d.change === 0 ? '' : d.change < 0 ? ' drop' : ' spike';
                const name = WD[d.date.getDay()];
                return (
                  <button
                    key={i}
                    type="button"
                    className={`cell vv v${i}${tone}${wsel === i ? ' on' : ''}${d.low ? '' : ' empty'}`}
                    aria-pressed={wsel === i}
                    aria-label={`${name}, ${dateOf(d.date)}, ${d.low ? 'market low ' + money(d.low.price) : 'no recorded checks'}`}
                    onClick={() => setSel(i)}
                    onMouseEnter={() => setSel(i)}
                    onFocus={() => setSel(i)}
                  >
                    <span>{name[0]}</span>
                    <span className="dt">{dateOf(d.date)}</span>
                    <span className="lo">{d.low ? '₹' + fmt(d.low.price) : 'no checks'}</span>
                    <span className="chg">
                      {d.change === null
                        ? i === 0
                          ? 'start'
                          : ''
                        : d.change === 0
                          ? 'no change'
                          : (d.change < 0 ? '−₹' : '+₹') + fmt(Math.abs(d.change))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rx" aria-live="polite">
              <div className="top">
                <span>Market snapshot</span>
                <span>Price Atlas</span>
              </div>
              <div className="row">
                <span>Date:</span>
                <span>
                  {WD[day.date.getDay()]}, {dateOf(day.date)}
                </span>
              </div>
              {day.low && day.high ? (
                <>
                  <div className="row big lo">
                    <span>Market low:</span>
                    <span>
                      ₹{fmt(day.low.price)} ({day.low.store})
                    </span>
                  </div>
                  <div className="row big hi">
                    <span>Market high:</span>
                    <span>
                      ₹{fmt(day.high.price)} ({day.high.store})
                    </span>
                  </div>
                  <div className="row">
                    <span>Change:</span>
                    <span>
                      {day.change === null
                        ? 'first recorded day'
                        : day.change === 0
                          ? 'none vs the day before'
                          : `${day.change < 0 ? '−₹' : '+₹'}${fmt(Math.abs(day.change))} vs the day before`}
                    </span>
                  </div>
                  <div className="row">
                    <span>Stock status:</span>
                    <span>
                      Available in {day.stores.length} store{day.stores.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {day.stores.map((s) => (
                    <div className="row sm" key={s.store}>
                      <span>{s.store}</span>
                      <span>₹{fmt(s.price)}</span>
                    </div>
                  ))}
                  {day.archivePoints.length > 0 && (
                    <details>
                      <summary>Includes Internet Archive captures</summary>
                      <p>
                        Archived store pages; not live checks. Values apply to their capture dates.
                      </p>
                      {day.archivePoints.map((o) => (
                        <p key={o.id}>
                          <HistoryCitation offer={o} />
                        </p>
                      ))}
                    </details>
                  )}
                </>
              ) : (
                <div className="row sm">
                  <span>No in-stock checks were recorded this day.</span>
                </div>
              )}
              <div className="stub">
                <span>observed prices only</span>
                <span className="ring">
                  {basis === 'item' ? 'item price · delivery extra' : 'delivered'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="budget rv">
          <span>1,000 requests a day</span>
          <span>0 paid credits per name search</span>
          <span>10 paid credits at most per pasted link</span>
          <span>targets checked hourly</span>
          <span>bulk catalog weekly</span>
        </div>
        {status && (
          <div className="prog rv">
            <div>
              <div style={{ fontFamily: 'var(--f-do)', fontWeight: 700, fontSize: 18 }}>
                Catalog expansion
              </div>
              <div className="slot" data-testid="catalog-coverage">
                {status.total} catalog products · {status.verified} verified by bulk importer ·{' '}
                {status.pending} pending bulk imports. Bulk progress is the counter at right; it
                excludes products added by other import paths.
              </div>
              {Number.isFinite(status.checkedAt) && (
                <div className="slot">
                  Counts checked{' '}
                  <time dateTime={new Date(status.checkedAt).toISOString()}>
                    {new Intl.DateTimeFormat('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(status.checkedAt)}{' '}
                    IST
                  </time>
                  .
                </div>
              )}
            </div>
            <div className="fig">
              {new Intl.NumberFormat('en-IN').format(status.verified)}{' '}
              <span style={{ color: 'var(--do-muted)' }}>
                of {new Intl.NumberFormat('en-IN').format(status.target)}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// sleep on it. we'll ping you. (ultraviolet alerts)
// ---------------------------------------------------------------------------
function AlertsWorld({
  products,
  offers,
  notifications,
  emailAvailable,
}: {
  products: Product[];
  offers: Offer[];
  notifications: Note[];
  emailAvailable: boolean;
}) {
  const latest = notifications.slice().sort((a, b) => b.created_at - a.created_at)[0];
  const sample = products.find((p) => lowest(offers.filter((o) => o.productId === p.id)) != null);
  const sampleBest = sample
    ? rank(offers.filter((o) => o.productId === sample.id)).offers[0]
    : null;
  const name = latest
    ? products.find((p) => p.id === latest.productId)?.name || latest.title
    : sample?.name;
  const price = latest ? latest.price : sampleBest ? total(sampleBest) : null;
  const store = latest ? latest.store : sampleBest?.store;
  return (
    <section className="uv" id="alerts">
      <div className="wrap uv-grid">
        <div className="rv">
          <h2>sleep on it. we’ll ping you.</h2>
          <p>
            Connect Telegram{emailAvailable ? ' or email' : ''}, set a target, and get one message
            when a fresh matching offer reaches it. Not one every hour.
          </p>
          <div className="uv-facts">
            <span>link expires in 10 min</span>
            <span>press start in the bot</span>
            <span>send /stop to leave</span>
          </div>
          <Link prefetch={false} className="uv-pill" href="/settings">
            connect telegram
          </Link>
          {emailAvailable && (
            <Link prefetch={false} className="uv-pill o" href="/settings">
              use email
            </Link>
          )}
          <a className="uv-pill o" href="#targets">
            pin a target
          </a>
        </div>
        {name && price != null && (
          <div
            className="phone rv"
            aria-label={latest ? 'Your latest alert' : 'Example alert messages'}
          >
            <div className="msg">
              <b>₹{fmt(price)}</b>
              {name} {latest ? 'reached your target' : 'is at this price'} on{' '}
              {storeLabel(store || '')}.
              <small>
                {latest ? 'recorded ' + ago(latest.created_at) : 'example message, recorded price'}
              </small>
            </div>
            <div className="msg">
              {latest
                ? 'Price basis follows your saved target. Delivery may be extra; verify at checkout.'
                : 'This example uses a recorded delivered total. Bank offers were not counted.'}
              <small>price atlas</small>
            </div>
            <div className="msg">
              The next alert comes only after it rises above your target and drops again.
              <small>one alert per drop</small>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The assembled home worlds
// ---------------------------------------------------------------------------
export function HomeWorlds({
  products,
  offers,
  watches,
  rules,
  notifications,
  emailAvailable,
  onSave,
  onPin,
  initialTarget,
}: {
  products: Product[];
  offers: Offer[];
  watches: Watch[];
  rules: Rule[];
  notifications: Note[];
  emailAvailable: boolean;
  onSave: (p: Product) => void;
  onPin: (
    p: Product,
    rupees: number,
    store: string,
    basis: Basis,
    ruleId?: string,
  ) => Promise<boolean>;
  initialTarget?: PinDraft;
}) {
  const [tideProducts, setTideProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<Record<string, Offer[]>>({});
  const [historyBasis, setHistoryBasis] = useState<Basis>('item');
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyError, setHistoryError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const ids = watches
    .slice(0, 4)
    .map((watch) => watch.product_id)
    .join(',');
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      setHistoryState('loading');
      setHistoryError('');
      try {
        const result = await fetchJson<{ products: Product[]; history: Record<string, Offer[]> }>(
          `/api/v1/history?days=30${ids ? `&ids=${encodeURIComponent(ids)}` : ''}`,
          { signal: controller.signal },
        );
        if (alive) {
          setTideProducts(result.products);
          setHistory(result.history);
          setHistoryState('ready');
        }
      } catch (error) {
        if (alive) {
          setHistoryState('error');
          setHistoryError(
            error instanceof Error ? error.message : 'Could not load recorded history.',
          );
        }
      }
    };
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      controller.abort();
      io.disconnect();
    };
  }, [ids, historyVersion]);
  const ridges = tideProducts.map((p) => ({
    key: p.id,
    name: p.name,
    obs: history[p.id] || [],
  }));
  // The week tray follows whichever product has the most recorded checks; no picker.
  const weekProduct =
    [...tideProducts].sort(
      (a, b) => (history[b.id]?.length || 0) - (history[a.id]?.length || 0),
    )[0] || null;
  return (
    <div className="hs" ref={box}>
      <OffersWorld products={products} offers={offers} />
      <FridgeWorld
        products={products}
        offers={offers}
        watches={watches}
        rules={rules}
        onSave={onSave}
      />
      <TargetsWorld
        products={products}
        offers={offers}
        watches={watches}
        rules={rules}
        onPin={onPin}
        initialTarget={initialTarget}
      />
      <div className="history-tools">
        <label>
          History price basis{' '}
          <select
            aria-label="Home history price basis"
            value={historyBasis}
            onChange={(event) => setHistoryBasis(event.target.value as Basis)}
          >
            <option value="item">Item price · shipping excluded</option>
            <option value="delivered">Delivered total · known shipping only</option>
          </select>
        </label>
        <button
          type="button"
          className="outline-button"
          disabled={historyState === 'loading'}
          onClick={() => setHistoryVersion((version) => version + 1)}
        >
          Refresh recorded history
        </button>
        <p data-testid="history-coverage" role="status">
          {historyState === 'loading'
            ? 'Loading recorded checks…'
            : historyState === 'error'
              ? `${historyError} Retry with Refresh recorded history.`
              : (() => {
                  const coverage = historyCoverage(Object.values(history).flat(), historyBasis);
                  return `${coverage.recordedDays} of 30 days have recorded ${historyBasis} prices across these products. ${coverage.first ? `Available from ${coverage.first} to ${coverage.last}.` : 'Tracking has not produced eligible checks for this basis yet.'} Blank days have no recorded checks; they are never filled with invented prices.`;
                })()}
        </p>
      </div>
      <TidesWorld ridges={ridges} basis={historyBasis} />
      <ExternalHistory
        sourceUrl={
          weekProduct?.attributes['Product URL'] ||
          offers.find((offer) => offer.productId === weekProduct?.id && offer.purchaseUrl)
            ?.purchaseUrl
        }
      />
      <WeekWorld
        product={weekProduct}
        obs={weekProduct ? history[weekProduct.id] || [] : []}
        basis={historyBasis}
      />
      <AlertsWorld
        products={products}
        offers={offers}
        notifications={notifications}
        emailAvailable={emailAvailable}
      />
    </div>
  );
}
