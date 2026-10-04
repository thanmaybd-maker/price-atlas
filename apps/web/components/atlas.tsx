'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  Search,
  Bookmark,
  Bell,
  ChevronDown,
  Check,
  Plus,
  X,
  SlidersHorizontal,
  Smartphone,
  Laptop,
  Headphones,
  Tablet,
  Monitor,
  ShieldCheck,
  TrendingDown,
  Link2,
  LayoutGrid,
  LogOut,
  Settings,
  ExternalLink,
  Activity,
  CheckCheck,
  Menu,
} from 'lucide-react';
import {
  money,
  rank,
  total,
  eligible,
  type Product,
  type Offer,
  type Rule,
  type Category,
} from '@domain/index';
import { ProductArt } from './product-art';
import { PriceChart } from './chart';
type User = { id: string; name: string; notifications: number };
type Session = {
  user: User | null;
  watches: { id: string; product_id: string; collection: string }[];
  rules: Rule[];
  notifications: {
    id: string;
    productId: string;
    price: number;
    store: string;
    state: string;
    created_at: number;
    title: string;
  }[];
};
type Admin = {
  providers: { store: string; paused: number }[];
  runs: { id: string; started_at: number; status: string; observations: number }[];
  counts: { products: number; observations: number; rules: number };
};
const categories: { id: Category; name: string; icon: typeof Smartphone }[] = [
  { id: 'phones', name: 'Phones', icon: Smartphone },
  { id: 'laptops', name: 'Laptops', icon: Laptop },
  { id: 'audio', name: 'Audio', icon: Headphones },
  { id: 'tablets', name: 'Tablets', icon: Tablet },
  { id: 'monitors', name: 'Monitors', icon: Monitor },
];
const empty: Session = { user: null, watches: [], rules: [], notifications: [] };
async function api(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(`/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || result.message || 'Something went wrong.');
  return result;
}
function relative(at: number) {
  const mins = Math.floor((Date.now() - at) / 60000);
  return mins < 1
    ? 'Just checked'
    : mins < 60
      ? `Checked ${mins}m ago`
      : `Checked ${Math.floor(mins / 60)}h ago`;
}
export default function Atlas({
  route,
  initialProducts,
  initialOffers,
  initialHistory,
}: {
  route: string[];
  initialProducts: Product[];
  initialOffers: Offer[];
  initialHistory: Offer[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const page = route[0] || 'home';
  const [products] = useState(initialProducts);
  const [offers, setOffers] = useState(initialOffers);
  const [session, setSession] = useState<Session>(empty);
  const [query, setQuery] = useState(params.get('q') || '');
  const [toast, setToast] = useState('');
  const [auth, setAuth] = useState(false);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState('all');
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [history, setHistory] = useState(initialHistory);
  const [range, setRange] = useState(30);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [menu, setMenu] = useState(false);
  const [collection, setCollection] = useState('All collections');
  const [reportProduct, setReportProduct] = useState<Product | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const current = products.find((p) => p.slug === route[1] || p.id === route[1]);
  const category = page === 'category' ? route[1] : params.get('category') || '';
  const sort = params.get('sort') || 'recommended';
  const brand = params.get('brand') || '';
  const maximum = Number(params.get('max') || 0);
  async function refresh() {
    const result = await api('session');
    setSession(result);
  }
  useEffect(() => {
    void refresh().catch(() => setToast('Unable to load your session. Check your connection.'));
    const stored = localStorage.getItem('atlas-compare');
    if (stored)
      try {
        setCompare(JSON.parse(stored));
      } catch {}
    document.documentElement.dataset.theme = localStorage.getItem('atlas-theme') || 'light';
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    setQuery(params.get('q') || '');
    setHistory(initialHistory);
    setMenu(false);
  }, [params, initialHistory]);
  useEffect(() => {
    if (page === 'admin')
      void api('admin')
        .then(setAdmin)
        .catch((e) => setToast(e.message));
  }, [page]);
  useEffect(() => {
    const timer = setInterval(() => {
      void api('search')
        .then((r) => setOffers(r.offers))
        .catch(() => {});
      void refresh().catch(() => {});
      if (current)
        void api(`products/${current.id}?days=90`)
          .then((r) => setHistory(r.history))
          .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [current?.id]);
  useEffect(() => {
    if (!(auth || targetProduct || reportProduct)) return;
    const previous = document.activeElement as HTMLElement;
    const id = setTimeout(
      () => modalRef.current?.querySelector<HTMLElement>('input,button')?.focus(),
      30,
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuth(false);
        setTargetProduct(null);
        setReportProduct(null);
        pending.current = null;
      }
      if (e.key === 'Tab') {
        const elements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href]',
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(id);
      document.removeEventListener('keydown', key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [auth, targetProduct, reportProduct]);
  function notify(message: string) {
    setToast(message);
  }
  function requireUser(action: () => void) {
    if (session.user) action();
    else {
      pending.current = action;
      setAuth(true);
    }
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Unable to complete action.');
    } finally {
      setBusy(false);
    }
  }
  function saved(id: string) {
    return session.watches.some((w) => w.product_id === id);
  }
  function save(p: Product) {
    requireUser(
      () =>
        void perform(async () => {
          await api(saved(p.id) ? `watches/${p.id}` : 'watches', saved(p.id) ? 'DELETE' : 'POST', {
            productId: p.id,
          });
          await refresh();
          notify(saved(p.id) ? 'Removed from your shortlist.' : 'Saved to your shortlist.');
        }),
    );
  }
  function openTarget(p: Product, rule?: Rule) {
    setEditRule(rule || null);
    setTarget(
      rule
        ? String(rule.target / 100)
        : String(
            Math.floor(
              ((rank(offers.filter((o) => o.productId === p.id)).lowest ?? p.basePrice) * 0.95) /
                10000,
            ) * 100,
          ),
    );
    setScope(rule?.store || 'all');
    setTargetProduct(p);
  }
  function toggleCompare(id: string) {
    const next = compare.includes(id) ? compare.filter((v) => v !== id) : [...compare, id];
    if (next.length > 4) {
      notify('Compare up to four exact variants at a time.');
      return;
    }
    setCompare(next);
    localStorage.setItem('atlas-compare', JSON.stringify(next));
  }
  function navigateFilter(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`/${page === 'category' ? `category/${category}` : 'search'}?${p}`);
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    if (/^https?:\/\//i.test(query)) {
      await perform(async () => {
        await api('imports', 'POST', { url: query });
      });
    } else router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  let filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!params.get('q') ||
        `${p.name} ${p.subtitle} ${p.brand}`
          .toLowerCase()
          .includes(params.get('q')!.toLowerCase())) &&
      (!brand || p.brand === brand) &&
      (!maximum ||
        (rank(offers.filter((o) => o.productId === p.id)).lowest ?? Infinity) <= maximum * 100),
  );
  if (sort.startsWith('price'))
    filtered = filtered.sort(
      (a, b) =>
        ((rank(offers.filter((o) => o.productId === a.id)).lowest ?? Infinity) -
          (rank(offers.filter((o) => o.productId === b.id)).lowest ?? Infinity)) *
        (sort === 'price-desc' ? -1 : 1),
    );
  function Card({ p, index = 0 }: { p: Product; index?: number }) {
    const po = offers.filter((o) => o.productId === p.id);
    const r = rank(po);
    return (
      <article key={p.id} className="product-card" style={{ animationDelay: `${index * 45}ms` }}>
        <div className="card-art">
          <Link href={`/p/${p.slug}`} tabIndex={-1} aria-hidden="true">
            <ProductArt product={p} />
          </Link>
          <span className="card-category">{categories.find((c) => c.id === p.category)?.name}</span>
          <button
            className={`save-icon ${saved(p.id) ? 'selected' : ''}`}
            aria-label={`${saved(p.id) ? 'Unsave' : 'Save'} ${p.name}`}
            onClick={() => save(p)}
          >
            <Bookmark size={18} fill={saved(p.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="card-body">
          <p className="eyebrow brand">{p.brand}</p>
          <Link className="product-name" href={`/p/${p.slug}`}>
            {p.name}
          </Link>
          <p className="variant">{p.subtitle}</p>
          <div className="card-price-row">
            <div>
              <span className="tiny-label">
                {r.offers.length > 1
                  ? 'Lowest delivered price'
                  : r.offers.length
                    ? '1 available offer'
                    : 'No fresh offers'}
              </span>
              <strong className="card-price">{money(r.lowest)}</strong>
            </div>
            <span className="micro-trend">
              <TrendingDown size={22} />
            </span>
          </div>
          <div className="card-bottom">
            <span>
              <i className="store-dot" /> {r.offers.length} available offers
            </span>
            <button
              className={compare.includes(p.id) ? 'compare-button active' : 'compare-button'}
              onClick={() => toggleCompare(p.id)}
              aria-label={`${compare.includes(p.id) ? 'Remove' : 'Add'} ${p.name} ${compare.includes(p.id) ? 'from' : 'to'} comparison`}
            >
              {compare.includes(p.id) ? <Check size={14} /> : <Plus size={14} />} Compare
            </button>
          </div>
        </div>
      </article>
    );
  }
  const heroProduct = products[0];
  return (
    <>
      <div className="demo-bar">
        <span className="demo-dot" /> You’re exploring the demo. All prices and products are
        synthetic fixtures.{' '}
        <Link href="/help">
          How it works <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="Price Atlas home">
            <span className="brand-mark">
              <span />
              <span />
              <span />
            </span>
            PRICE<span className="atlas-word">ATLAS</span>
            <span className="brand-period">.</span>
          </Link>
          <nav className={menu ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">
            <Link
              className={['home', 'search', 'category', 'p'].includes(page) ? 'active' : ''}
              href="/search"
            >
              Discover
            </Link>
            <Link className={page === 'watchlist' ? 'active' : ''} href="/watchlist">
              Watchlist{' '}
              {session.watches.length > 0 && (
                <span className="nav-count">{session.watches.length}</span>
              )}
            </Link>
            <Link
              className={page === 'compare' ? 'active' : ''}
              href={`/compare?items=${compare.join(',')}`}
            >
              Compare
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              className="icon-button notification-link"
              href="/alerts"
              aria-label="Price alerts"
            >
              <Bell size={20} />
              {session.notifications.some((n) => n.state === 'delivered') && <i />}
            </Link>
            <span className="header-divider" />
            {session.user ? (
              <Link className="avatar" href="/settings" aria-label="Account settings">
                {session.user.name.slice(0, 1).toUpperCase()}
              </Link>
            ) : (
              <button className="sign-in" onClick={() => setAuth(true)}>
                Try demo <ArrowUpRight size={15} />
              </button>
            )}
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>
      <main id="main-content">
        {page === 'home' ? (
          <>
            <section className="hero page-width">
              <div className="hero-copy">
                <div className="eyebrow hero-eyebrow">
                  <span className="small-line" /> A LITTLE RESEARCH. A BETTER BUY.
                </div>
                <h1>
                  The right product.
                  <br />
                  The{' '}
                  <span>
                    better price
                    <svg viewBox="0 0 360 16" aria-hidden="true">
                      <path d="M4 11 Q172 -3 350 9" />
                    </svg>
                  </span>
                  .
                </h1>
                <p className="hero-description">
                  Less tab hopping. More knowing.
                  <br />
                  Compare matching offers, explore price history,
                  <br className="desktop-only" /> and make your next purchase a considered one.
                </p>
                <SearchBox
                  hero
                  query={query}
                  setQuery={setQuery}
                  search={search}
                  products={products}
                />
                <div className="popular-searches">
                  <span>On your radar?</span>
                  {['Pixel 9', 'MacBook Air', 'Sony'].map((q) => (
                    <Link key={q} href={`/search?q=${encodeURIComponent(q)}`}>
                      {q}
                      <ArrowUpRight size={11} />
                    </Link>
                  ))}
                </div>
                <div className="hero-trust">
                  <span>
                    <ShieldCheck size={15} /> Exact variant matching
                  </span>
                  <span>
                    <Bell size={15} /> Your price. Your reminder.
                  </span>
                </div>
              </div>
              <div className="hero-stage">
                <div className="orbital orbit-one" />
                <div className="orbital orbit-two" />
                <span className="stage-index">01 / THE EVERYDAY FLAGSHIP</span>
                <div className="hero-product">
                  <ProductArt product={heroProduct} hero />
                </div>
                <div className="match-tag">
                  <span className="check-round">
                    <Check size={12} />
                  </span>{' '}
                  Same product. Better informed.
                </div>
                <div className="floating-price">
                  <div className="floating-top">
                    <span className="eyebrow">A PRICE WORTH WATCHING</span>
                    <TrendingDown size={20} />
                  </div>
                  <div className="floating-title">
                    Google Pixel 9 <span>128 GB · Obsidian</span>
                  </div>
                  <div className="floating-number">
                    {money(rank(offers.filter((o) => o.productId === heroProduct.id)).lowest)}
                    <span>lowest demo offer</span>
                  </div>
                  <svg className="hero-spark" viewBox="0 0 290 43" aria-hidden="true">
                    <path
                      d="M0 7 L31 7 L31 15 L62 15 L62 10 L101 10 L101 22 L145 22 L145 18 L177 18 L177 29 L220 29 L220 35 L290 35"
                      fill="none"
                      stroke="#147a57"
                      strokeWidth="2"
                    />
                    <path
                      d="M0 7 L31 7 L31 15 L62 15 L62 10 L101 10 L101 22 L145 22 L145 18 L177 18 L177 29 L220 29 L220 35 L290 35 L290 43 L0 43Z"
                      fill="#147a57"
                      opacity=".05"
                    />
                  </svg>
                  <Link href={`/p/${heroProduct.slug}`}>
                    Take a closer look <ArrowRight size={15} />
                  </Link>
                </div>
                <div className="stage-note">
                  <span className="live-dot" /> Illustrative demo · never a live quote
                </div>
              </div>
            </section>
            <div className="source-strip">
              <div className="page-width">
                <span>
                  ONE CLEAR VIEW.
                  <br />
                  <strong>TWO FAMILIAR STORES.</strong>
                </span>
                <div className="store-word amazon-word">
                  amazon<span>.in</span>
                  <i />
                </div>
                <span className="source-plus">+</span>
                <div className="store-word flipkart-word">
                  Flipkart <span>f</span>
                </div>
                <div className="source-strip-note">
                  <CheckCheck size={20} />
                  <span>
                    Matching variants.
                    <br />
                    Transparent comparisons.
                  </span>
                </div>
              </div>
            </div>
            <section className="discovery-section page-width">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">GOOD FINDS START HERE</p>
                  <h2>A little closer to your next upgrade.</h2>
                </div>
                <Link className="text-link" href="/search">
                  Explore all products <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="category-tabs">
                <Link className="category-tab selected" href="/">
                  <LayoutGrid size={17} />
                  All discoveries
                </Link>
                {categories.map((c) => (
                  <Link className="category-tab" key={c.id} href={`/category/${c.id}`}>
                    <c.icon size={17} />
                    {c.name}
                  </Link>
                ))}
                <span className="category-caption">Thoughtfully compared. Never rushed.</span>
              </div>
              <div className="product-grid">
                {products.slice(0, 4).map((p, i) => Card({ p, index: i }))}
              </div>
              <div className="catalog-note">
                <ShieldCheck size={14} /> Prices include known delivery charges. Conditional bank
                and exchange offers never influence the ranking.
              </div>
            </section>
            <section className="manifesto page-width">
              <div className="manifesto-intro">
                <span className="eyebrow">BUY WITH A LITTLE MORE CERTAINTY</span>
                <h2>
                  Your next purchase.
                  <br />
                  With the full picture.
                </h2>
                <p>We make the details clear, so the decision can be yours.</p>
                <Link href="/help" className="text-link">
                  The Price Atlas approach <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="benefit">
                <span className="benefit-icon">
                  <CheckCheck />
                </span>
                <span className="step-number">01</span>
                <h3>Apples to apples.</h3>
                <p>
                  Same model. Same storage. Same color. We compare the details that actually matter.
                </p>
              </div>
              <div className="benefit">
                <span className="benefit-icon">
                  <Activity />
                </span>
                <span className="step-number">02</span>
                <h3>See the bigger picture.</h3>
                <p>
                  A price is a moment. Recorded history gives it context, with every gap made
                  visible.
                </p>
              </div>
              <div className="benefit">
                <span className="benefit-icon">
                  <Bell />
                </span>
                <span className="step-number">03</span>
                <h3>Let your price come to you.</h3>
                <p>
                  Set a target, step away. Get an in-app reminder when a fresh matching offer
                  qualifies.
                </p>
              </div>
            </section>
          </>
        ) : page === 'search' || page === 'category' ? (
          <section className="page-width results-page">
            <div className="breadcrumbs">
              <Link href="/">Home</Link>
              <span>/</span>Discover
              {category && (
                <>
                  <span>/</span>
                  {categories.find((c) => c.id === category)?.name}
                </>
              )}
            </div>
            <div className="results-heading">
              <div>
                <p className="eyebrow">YOUR NEXT GOOD FIND</p>
                <h1>
                  {category
                    ? categories.find((c) => c.id === category)?.name
                    : params.get('q')
                      ? `Results for “${params.get('q')}”`
                      : 'Explore the atlas.'}
                </h1>
                <p className="muted">Exact variants. Transparent prices. A clearer choice.</p>
              </div>
              <SearchBox query={query} setQuery={setQuery} search={search} products={products} />
            </div>
            <div className="category-tabs">
              <Link className={`category-tab ${!category ? 'selected' : ''}`} href="/search">
                <LayoutGrid size={17} />
                All products
              </Link>
              {categories.map((c) => (
                <Link
                  className={`category-tab ${category === c.id ? 'selected' : ''}`}
                  key={c.id}
                  href={`/category/${c.id}`}
                >
                  <c.icon size={17} />
                  {c.name}
                </Link>
              ))}
            </div>
            <div className="filter-bar">
              <div className="filter-controls">
                <SlidersHorizontal size={18} />
                <label className="sr-only" htmlFor="brand">
                  Brand
                </label>
                <select
                  id="brand"
                  value={brand}
                  onChange={(e) => navigateFilter('brand', e.target.value)}
                >
                  <option value="">All brands</option>
                  {[
                    ...new Set(
                      products
                        .filter((p) => !category || p.category === category)
                        .map((p) => p.brand),
                    ),
                  ].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="budget">
                  Budget
                </label>
                <select
                  id="budget"
                  value={maximum || ''}
                  onChange={(e) => navigateFilter('max', e.target.value)}
                >
                  <option value="">Any budget</option>
                  <option value="10000">Under ₹10,000</option>
                  <option value="30000">Under ₹30,000</option>
                  <option value="60000">Under ₹60,000</option>
                </select>
                <span>{filtered.length} products</span>
              </div>
              <label className="sort-label">
                Sort by{' '}
                <select value={sort} onChange={(e) => navigateFilter('sort', e.target.value)}>
                  <option value="recommended">Recommended</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </select>
              </label>
            </div>
            {filtered.length ? (
              <div className="product-grid">{filtered.map((p, i) => Card({ p, index: i }))}</div>
            ) : (
              <Empty
                icon={Search}
                title="No exact match this time."
                text="Try a model name, clear a filter, or explore another category. The demo has eight carefully defined variants."
                action={
                  <Link className="primary" href="/search">
                    Clear filters <ArrowRight size={16} />
                  </Link>
                }
              />
            )}
          </section>
        ) : page === 'p' && current ? (
          ProductDetail()
        ) : page === 'compare' ? (
          ComparePage()
        ) : page === 'watchlist' ? (
          <section className="page-width utility-page">
            <PageHeading
              eyebrow="KEEP THE GOOD FINDS CLOSE"
              title="Your shortlist."
              description="A thoughtful purchase starts with a little patience."
            />
            <div className="filter-bar">
              <span>{session.watches.length} saved products</span>
              <label>
                Collection{' '}
                <select value={collection} onChange={(e) => setCollection(e.target.value)}>
                  <option>All collections</option>
                  {[...new Set(session.watches.map((w) => w.collection))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            {session.watches.length ? (
              <div className="watch-grid">
                {session.watches
                  .filter((w) => collection === 'All collections' || w.collection === collection)
                  .map((w) => {
                    const p = products.find((p) => p.id === w.product_id)!;
                    const r = rank(offers.filter((o) => o.productId === p.id));
                    const rule = session.rules.find((r) => r.productId === p.id);
                    return (
                      <article className="watch-card" key={w.id}>
                        <Link className="watch-art" href={`/p/${p.slug}`}>
                          <ProductArt product={p} />
                        </Link>
                        <div className="watch-main">
                          <span className="eyebrow">{w.collection}</span>
                          <Link className="product-name" href={`/p/${p.slug}`}>
                            {p.name}
                          </Link>
                          <p className="variant">{p.subtitle}</p>
                          <strong className="card-price">{money(r.lowest)}</strong>
                          <p className="muted small">
                            {rule
                              ? `Target ${money(rule.target)} · ${rule.enabled ? 'Active' : 'Paused'}`
                              : 'A good find. Set a target to keep an eye on it.'}
                          </p>
                          <div className="watch-actions">
                            <button className="outline-button" onClick={() => openTarget(p, rule)}>
                              <Bell size={15} />
                              {rule ? 'Edit target' : 'Set target'}
                            </button>
                            <button className="text-button" onClick={() => save(p)}>
                              Remove
                            </button>
                          </div>
                          <label className="collection-edit">
                            Move to collection
                            <input
                              aria-label={`Collection for ${p.name}`}
                              defaultValue={w.collection}
                              onBlur={(e) => {
                                if (e.target.value.trim() && e.target.value !== w.collection)
                                  void perform(async () => {
                                    await api('watches', 'POST', {
                                      productId: p.id,
                                      collection: e.target.value,
                                    });
                                    await refresh();
                                    notify('Collection updated.');
                                  });
                              }}
                            />
                          </label>
                        </div>
                      </article>
                    );
                  })}
              </div>
            ) : (
              <Empty
                icon={Bookmark}
                title="Make room for your next good find."
                text="Save products as you explore. They’ll stay here, along with your targets and fresh offer prices."
                action={
                  <Link className="primary" href="/search">
                    Discover products <ArrowRight size={16} />
                  </Link>
                }
              />
            )}
          </section>
        ) : page === 'alerts' ? (
          <section className="page-width utility-page">
            <PageHeading
              eyebrow="LESS CHECKING. MORE LIVING."
              title="Your price, on your terms."
              description="Targets use fresh matching offers and known delivered totals. Demo alerts arrive here, not by email."
            />
            {session.rules.length ? (
              <div className="alert-layout">
                <div>
                  <h2>
                    Active targets <span className="count-badge">{session.rules.length}</span>
                  </h2>
                  {session.rules.map((rule) => {
                    const p = products.find((p) => p.id === rule.productId)!;
                    return (
                      <div className="rule-card" key={rule.id}>
                        <div className="rule-icon">
                          <Bell size={21} />
                        </div>
                        <div>
                          <Link className="product-name" href={`/p/${p.slug}`}>
                            {p.name}
                          </Link>
                          <p className="muted small">
                            At or below {money(rule.target)} ·{' '}
                            {rule.store === 'all' ? 'Both demo sources' : rule.store}
                          </p>
                          <span className={`status-pill ${!rule.enabled ? 'paused' : ''}`}>
                            {rule.enabled ? 'Watching' : 'Paused'}
                          </span>
                        </div>
                        <div className="rule-actions">
                          <button className="text-button" onClick={() => openTarget(p, rule)}>
                            Edit
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              void perform(async () => {
                                await api('rules', 'PATCH', { ...rule, enabled: !rule.enabled });
                                await refresh();
                              })
                            }
                          >
                            {rule.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            aria-label={`Delete target for ${p.name}`}
                            className="icon-button"
                            onClick={() =>
                              void perform(async () => {
                                await api(`rules/${rule.id}`, 'DELETE');
                                await refresh();
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <h2>Notification history</h2>
                  {session.notifications.length ? (
                    session.notifications.map((n) => (
                      <article className="notification-card" key={n.id}>
                        <span className="check-round">
                          <Check size={13} />
                        </span>
                        <div>
                          <h3>{n.title}</h3>
                          <p>
                            {products.find((p) => p.id === n.productId)?.name} at {money(n.price)}
                          </p>
                          <span className="muted small">
                            {n.store} · {new Date(n.created_at).toLocaleString('en-IN')}
                            <br />
                            {n.state} · demo in-app alert
                          </span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="panel muted">Nothing yet. A qualifying check will appear here.</p>
                  )}
                </div>
              </div>
            ) : (
              <Empty
                icon={Bell}
                title="Good things are worth waiting for."
                text="Choose a product and set the price that feels right. We’ll keep your target here."
                action={
                  <Link className="primary" href="/search">
                    Find a product <ArrowRight size={16} />
                  </Link>
                }
              />
            )}
          </section>
        ) : page === 'settings' ? (
          SettingsPage()
        ) : page === 'admin' ? (
          AdminPage()
        ) : page === 'help' || page === 'about' ? (
          HelpPage()
        ) : (
          <section className="page-width utility-page">
            <Empty
              icon={Search}
              title="This page isn’t on the map."
              text="Head back to the catalog to find your next good purchase."
              action={
                <Link className="primary" href="/">
                  Back to home
                </Link>
              }
            />
          </section>
        )}
      </main>
      <footer className="footer">
        <div className="page-width footer-top">
          <div>
            <Link className="wordmark" href="/">
              PRICE<span className="atlas-word">ATLAS</span>
              <span className="brand-period">.</span>
            </Link>
            <p>Good research. Better decisions.</p>
          </div>
          <div className="footer-links">
            <Link href="/about">Our approach</Link>
            <Link href="/help">Help & methodology</Link>
            <Link href="/admin">Source status</Link>
            <Link href="/settings">Your preferences</Link>
          </div>
        </div>
        <div className="page-width footer-bottom">
          <span>© 2026 Price Atlas · Made for the considered buyer.</span>
          <span>
            India · INR ₹ <span className="footer-separator">/</span> Synthetic demo · Illustrative
            artwork
          </span>
        </div>
      </footer>
      {compare.length > 0 && page !== 'compare' && (
        <div className="compare-tray">
          <div className="compare-tray-items">
            <span className="compare-count">{compare.length}</span>
            <span>in your comparison</span>
            <div className="compare-mini-names">
              {compare.map((id) => (
                <span key={id}>
                  {products.find((p) => p.id === id)?.name}
                  <button
                    aria-label={`Remove ${products.find((p) => p.id === id)?.name} from comparison`}
                    onClick={() => toggleCompare(id)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <Link href={`/compare?items=${compare.join(',')}`} className="primary">
            Compare now <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {(auth || targetProduct || reportProduct) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAuth(false);
              setTargetProduct(null);
              setReportProduct(null);
              pending.current = null;
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={modalRef}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setAuth(false);
                setTargetProduct(null);
                setReportProduct(null);
                pending.current = null;
              }}
            >
              <X size={20} />
            </button>
            {auth ? (
              <>
                <span className="modal-symbol">
                  <Bookmark size={26} />
                </span>
                <p className="eyebrow">A SPACE FOR YOUR GOOD FINDS</p>
                <h2 id="modal-title">Make yourself at home.</h2>
                <p className="muted">
                  Create a local demo profile to save products and try price alerts. No email or
                  password needed.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    void perform(async () => {
                      await api('session', 'POST', { name: form.get('name') });
                      await refresh();
                      setAuth(false);
                      notify('Your demo profile is ready.');
                      const action = pending.current;
                      pending.current = null;
                      action?.();
                    });
                  }}
                >
                  <label>
                    Your name
                    <input
                      name="name"
                      required
                      maxLength={60}
                      placeholder="What should we call you?"
                      autoComplete="given-name"
                    />
                  </label>
                  <button className="primary full-width" disabled={busy}>
                    Create demo profile <ArrowRight size={17} />
                  </button>
                </form>
                <p className="fine-print">
                  This is a browser-bound demo session. Google and email sign-in will be available
                  after identity services are connected.
                </p>
              </>
            ) : targetProduct ? (
              <>
                <span className="modal-symbol">
                  <Bell size={26} />
                </span>
                <p className="eyebrow">LET THE RIGHT PRICE FIND YOU</p>
                <h2 id="modal-title">Name your price.</h2>
                <p>
                  {targetProduct.name} <span className="muted">· {targetProduct.subtitle}</span>
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!session.user) {
                      pending.current = () =>
                        notify('Your target is preserved. Choose Save target to finish.');
                      setAuth(true);
                      return;
                    }
                    void perform(async () => {
                      await api('rules', editRule ? 'PATCH' : 'POST', {
                        ...(editRule ? { id: editRule.id } : {}),
                        productId: targetProduct.id,
                        target: Math.round(Number(target) * 100),
                        store: scope,
                        basis: 'delivered',
                        operator: 'lte',
                        enabled: true,
                      });
                      await refresh();
                      setTargetProduct(null);
                      notify('Target saved. We’ll watch fresh matching demo offers.');
                    });
                  }}
                >
                  <label>
                    Notify me at or below
                    <div className="currency-input">
                      <span>₹</span>
                      <input
                        ref={targetInput}
                        value={target}
                        type="number"
                        min="1"
                        max="100000000"
                        step="1"
                        required
                        onChange={(e) => setTarget(e.target.value)}
                      />
                    </div>
                  </label>
                  <label>
                    Source
                    <select value={scope} onChange={(e) => setScope(e.target.value)}>
                      <option value="all">Both demo sources</option>
                      <option>Amazon</option>
                      <option>Flipkart</option>
                    </select>
                  </label>
                  <div className="notice">
                    <ShieldCheck size={18} />
                    <span>
                      Uses known delivered totals. Conditional discounts are excluded. The local
                      worker checks synthetic offers every minute.
                    </span>
                  </div>
                  <button className="primary full-width" disabled={busy}>
                    {session.user ? 'Save target' : 'Continue with a demo profile'}{' '}
                    <ArrowRight size={17} />
                  </button>
                </form>
              </>
            ) : reportProduct ? (
              <>
                <h2 id="modal-title">Help keep the details right.</h2>
                <p className="muted">Report an issue with {reportProduct.name}.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    requireUser(
                      () =>
                        void perform(async () => {
                          const result = await api('reports', 'POST', {
                            productId: reportProduct.id,
                            reason: f.get('reason'),
                          });
                          setReportProduct(null);
                          notify(`Report saved. Reference: ${result.reference.slice(0, 8)}`);
                        }),
                    );
                  }}
                >
                  <label>
                    What looks wrong?
                    <textarea name="reason" minLength={5} maxLength={1000} required rows={4} />
                  </label>
                  <button className="primary" disabled={busy}>
                    Send report
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );

  function ProductDetail() {
    if (!current) return null;
    const p = current;
    const po = offers.filter((o) => o.productId === p.id);
    const r = rank(po);
    const rule = session.rules.find((r) => r.productId === p.id);
    const visibleHistory = history.filter((o) => o.observedAt >= Date.now() - range * 86400000);
    return (
      <section className="page-width detail-page">
        <div className="breadcrumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href={`/category/${p.category}`}>
            {categories.find((c) => c.id === p.category)?.name}
          </Link>
          <span>/</span>
          {p.name}
        </div>
        <div className="detail-grid">
          <div>
            <div className="detail-art">
              <span className="detail-art-label">
                <ShieldCheck size={14} /> EXACT VARIANT
              </span>
              <ProductArt product={p} hero />
              <span className="art-caption">Illustrative demo artwork</span>
            </div>
            <div className="detail-thumbs">
              <span>
                <ProductArt product={p} />
              </span>
              <p>
                Every detail matched.
                <br />
                <strong>No smaller storage. No different color.</strong>
              </p>
            </div>
          </div>
          <div className="detail-info">
            <p className="eyebrow">
              {p.brand} / {categories.find((c) => c.id === p.category)?.name}
            </p>
            <h1>{p.name}</h1>
            <p className="detail-description">{p.description}</p>
            <div className="variant-chips">
              {Object.entries(p.attributes)
                .filter(([k]) => ['RAM', 'Storage', 'Color', 'Connectivity'].includes(k))
                .map(([k, v]) => (
                  <span key={k}>
                    <Check size={12} />
                    {v}
                  </span>
                ))}
            </div>
            <div className="detail-price">
              <span className="tiny-label">
                {r.offers.length > 1
                  ? 'Lowest eligible delivered price'
                  : r.offers.length
                    ? 'Available delivered price'
                    : 'No fresh eligible offers'}
              </span>
              <div>
                <strong>{money(r.lowest)}</strong>
                <span className="status-pill">
                  {r.winners.length > 1 ? 'Price tie' : `${r.offers.length} matching offers`}
                </span>
              </div>
              <p>
                <span className="live-dot" />
                {po[0] ? relative(po[0].observedAt) : 'Awaiting observation'} · Synthetic demo
                prices
              </p>
            </div>
            <div className="detail-actions">
              <button className="primary" onClick={() => openTarget(p, rule)}>
                <Bell size={17} />
                {rule ? 'Edit price target' : 'Set a price target'}
              </button>
              <button
                className={`outline-button ${saved(p.id) ? 'saved' : ''}`}
                onClick={() => save(p)}
              >
                <Bookmark size={17} />
                {saved(p.id) ? 'Saved' : 'Save product'}
              </button>
              <button
                className="icon-button boxed"
                aria-label="Add to comparison"
                onClick={() => toggleCompare(p.id)}
              >
                {compare.includes(p.id) ? <Check size={19} /> : <Plus size={19} />}
              </button>
            </div>
            <details className="match-details">
              <summary>
                <ShieldCheck size={16} /> Why these offers match <ChevronDown size={16} />
              </summary>
              <p>
                Both synthetic listings are assigned to the exact {p.name} variant below. Unknown
                identity fields would require review before comparison.
              </p>
              <dl>
                {Object.entries(p.attributes)
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          </div>
        </div>
        <div className="section-heading detail-section-heading">
          <div>
            <p className="eyebrow">THE SAME PRODUCT. SIDE BY SIDE.</p>
            <h2>Choose your store.</h2>
          </div>
          <span className="muted small">Source default location · INR</span>
        </div>
        <div className="offers-table">
          <div className="offers-head">
            <span>Store & seller</span>
            <span>Item price</span>
            <span>Delivery</span>
            <span>Delivered total</span>
            <span>Availability</span>
            <span />
          </div>
          {po.map((o) => (
            <div
              className={`offer-row ${r.winners.some((w) => w.id === o.id) ? 'winner' : ''}`}
              key={o.id}
            >
              <div>
                <strong className={`offer-store ${o.store.toLowerCase()}`}>{o.store}</strong>
                <span>{o.seller}</span>
              </div>
              <div>
                <span className="mobile-label">Item price</span>
                {eligible(o) ? money(o.itemPrice) : 'Expired'}
              </div>
              <div>
                <span className="mobile-label">Delivery</span>
                {o.shipping === null ? 'Unknown' : o.shipping === 0 ? 'Free' : money(o.shipping)}
              </div>
              <div>
                <span className="mobile-label">Total</span>
                <strong>{eligible(o) ? money(total(o)) : 'Unavailable'}</strong>
                {r.winners.some((w) => w.id === o.id) && (
                  <span className="best-label">
                    {r.winners.length > 1 ? 'Equal lowest' : 'Lowest eligible'}
                  </span>
                )}
              </div>
              <div>
                <span className="stock-label">
                  <i />
                  {eligible(o) ? 'In stock' : 'Refresh needed'}
                </span>
                <span>{relative(o.observedAt)}</span>
              </div>
              <button
                className="store-button"
                onClick={() =>
                  notify(
                    'Demo listing: no retailer destination is attached. Live purchase links require an authorized source.',
                  )
                }
                aria-label={`About ${o.store} demo purchase link`}
              >
                Demo offer <ArrowUpRight size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Illustrative prices, not retailer quotes. Bank, exchange, membership, and coupon discounts
          are excluded.{' '}
          <button className="text-button" onClick={() => setReportProduct(p)}>
            Report a price or match issue
          </button>
        </p>
        <div className="history-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONTEXT FOR YOUR NEXT MOVE</p>
              <h2>A price has a story.</h2>
            </div>
            <div className="range-control">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  className={range === d ? 'selected' : ''}
                  onClick={() => setRange(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
          <div className="history-summary">
            <div>
              <span className="tiny-label">Lowest in shown demo checks</span>
              <strong>
                {visibleHistory.length
                  ? money(Math.min(...visibleHistory.map((o) => total(o) ?? Infinity)))
                  : 'No checks'}
              </strong>
            </div>
            <div>
              <span className="tiny-label">Your target</span>
              <strong>{rule ? money(rule.target) : 'Make it yours'}</strong>
            </div>
            <div className="history-note">
              Synthetic history for exploring the experience.
              <br />
              Real charts will start with permitted observations.
            </div>
          </div>
          <PriceChart observations={visibleHistory} target={rule?.target} />
        </div>
        <div className="spec-section">
          <div>
            <p className="eyebrow">THE DETAILS THAT MATTER</p>
            <h2>Know exactly what you’re comparing.</h2>
          </div>
          <dl className="spec-list">
            {Object.entries(p.attributes).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  }
  function ComparePage() {
    const ids = params.get('items')?.split(',').filter(Boolean) || compare;
    const selected = products.filter((p) => ids.includes(p.id)).slice(0, 4);
    const keys = [...new Set(selected.flatMap((p) => Object.keys(p.attributes)))];
    return (
      <section className="page-width utility-page">
        <PageHeading
          eyebrow="PUT YOUR OPTIONS IN PERSPECTIVE"
          title="A clearer side-by-side."
          description="Compare up to four exact variants. Each price belongs to that product’s own matching offers."
        />
        {selected.length ? (
          <div className="table-scroll comparison-table">
            <table>
              <thead>
                <tr>
                  <th>At a glance</th>
                  {selected.map((p) => (
                    <th key={p.id}>
                      <ProductArt product={p} />
                      <Link className="product-name" href={`/p/${p.slug}`}>
                        {p.name}
                      </Link>
                      <p className="variant">{p.subtitle}</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          const next = selected.filter((x) => x.id !== p.id).map((x) => x.id);
                          setCompare(next);
                          localStorage.setItem('atlas-compare', JSON.stringify(next));
                          router.replace(`/compare?items=${next.join(',')}`);
                        }}
                      >
                        Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="price-compare-row">
                  <th>Lowest delivered price</th>
                  {selected.map((p) => (
                    <td key={p.id}>
                      {money(rank(offers.filter((o) => o.productId === p.id)).lowest)}
                    </td>
                  ))}
                </tr>
                {keys.map((k) => (
                  <tr
                    className={
                      new Set(selected.map((p) => p.attributes[k] || 'Not specified')).size > 1
                        ? 'different'
                        : ''
                    }
                    key={k}
                  >
                    <th>{k}</th>
                    {selected.map((p) => (
                      <td key={p.id}>{p.attributes[k] || 'Not specified'}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th>Keep an eye on it</th>
                  {selected.map((p) => (
                    <td key={p.id}>
                      <button className="outline-button" onClick={() => openTarget(p)}>
                        <Bell size={15} />
                        Set target
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="fine-print">
              Tinted rows show differences. Unspecified fields are never assumed to match.
            </p>
          </div>
        ) : (
          <Empty
            icon={LayoutGrid}
            title="Find your contenders."
            text="Use the Compare button on any product to add it here. Pick up to four."
            action={
              <Link href="/search" className="primary">
                Explore the catalog <ArrowRight size={16} />
              </Link>
            }
          />
        )}
      </section>
    );
  }
  function SettingsPage() {
    return (
      <section className="page-width utility-page narrow">
        <PageHeading
          eyebrow="MAKE IT YOURS"
          title="A few personal details."
          description="Your demo profile, notification preferences, and data controls."
        />
        {session.user ? (
          <>
            <div className="settings-panel">
              <h2>Hello, {session.user.name}.</h2>
              <p className="muted">Local demo profile · browser session</p>
              <div className="setting-row">
                <div>
                  <strong>In-app price notifications</strong>
                  <p className="muted small">Turning these off suppresses pending deliveries.</p>
                </div>
                <button
                  className={`toggle ${session.user.notifications ? 'on' : ''}`}
                  role="switch"
                  aria-checked={!!session.user.notifications}
                  aria-label="In-app price notifications"
                  onClick={() =>
                    void perform(async () => {
                      await api('preferences', 'PATCH', { enabled: !session.user?.notifications });
                      await refresh();
                    })
                  }
                >
                  <span />
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Appearance</strong>
                  <p className="muted small">Choose the view that feels right.</p>
                </div>
                <select
                  aria-label="Color theme"
                  defaultValue={
                    typeof document !== 'undefined'
                      ? document.documentElement.dataset.theme
                      : 'light'
                  }
                  onChange={(e) => {
                    document.documentElement.dataset.theme = e.target.value;
                    localStorage.setItem('atlas-theme', e.target.value);
                  }}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Email & Google sign-in</strong>
                  <p className="muted small">An identity provider has not been connected.</p>
                </div>
                <span className="status-pill paused">Not connected</span>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Time zone</strong>
                  <p className="muted small">Dates display in your browser’s local time.</p>
                </div>
                <span className="small">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
              </div>
            </div>
            <div className="settings-panel">
              <h2>Your data belongs to you.</h2>
              <div className="setting-row">
                <div>
                  <strong>Export your data</strong>
                  <p className="muted small">Download your profile, saved products, and targets.</p>
                </div>
                <a
                  className="outline-button"
                  href="/api/v1/export"
                  download="price-atlas-export.json"
                >
                  Export JSON <ArrowDown size={15} />
                </a>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Sign out</strong>
                  <p className="muted small">A new demo session creates a separate profile.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    void perform(async () => {
                      await api('session', 'DELETE');
                      await refresh();
                      notify('Signed out.');
                    })
                  }
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
              <details className="delete-account">
                <summary>Delete this demo account</summary>
                <p>
                  This permanently removes this profile, its targets, notifications, and saved
                  products.
                </p>
                <button
                  className="danger-button"
                  onClick={() =>
                    void perform(async () => {
                      await api('account', 'DELETE');
                      await refresh();
                      notify('Demo account deleted.');
                    })
                  }
                >
                  Delete account and data
                </button>
              </details>
            </div>
          </>
        ) : (
          <Empty
            icon={Settings}
            title="A little space of your own."
            text="Start a demo profile to manage saved products and preferences."
            action={
              <button className="primary" onClick={() => setAuth(true)}>
                Create demo profile
              </button>
            }
          />
        )}
      </section>
    );
  }
  function AdminPage() {
    return (
      <section className="page-width utility-page">
        <PageHeading
          eyebrow="BEHIND THE COMPARISON"
          title="The health of the atlas."
          description="Read-only local operations. Source capabilities remain synthetic until live integrations are authorized and configured."
        />
        {admin ? (
          <>
            <div className="admin-stats">
              {Object.entries(admin.counts).map(([k, v]) => (
                <div className="panel" key={k}>
                  <span className="eyebrow">{k}</span>
                  <strong>{v.toLocaleString('en-IN')}</strong>
                </div>
              ))}
              <div className="panel">
                <span className="eyebrow">ENVIRONMENT</span>
                <strong className="mode-label">Demo</strong>
              </div>
            </div>
            <h2>Source connections</h2>
            <div className="source-cards">
              {admin.providers.map((p) => (
                <div className="panel" key={p.store}>
                  <div className="section-heading">
                    <h3>{p.store}</h3>
                    <span className={`status-pill ${p.paused ? 'paused' : ''}`}>
                      {p.paused ? 'Paused' : 'Demo adapter'}
                    </span>
                  </div>
                  <p className="muted">
                    Synthetic catalog and observations. No live retailer requests.
                  </p>
                  <div className="capabilities">
                    <span>
                      <Check size={13} />
                      Demo prices
                    </span>
                    <span>
                      <Check size={13} />
                      Demo history
                    </span>
                    <span>
                      <Check size={13} />
                      In-app alerts
                    </span>
                  </div>
                  <p className="fine-print">
                    Live search, product resolution, affiliate destinations, and email content
                    permissions are not connected.
                  </p>
                </div>
              ))}
            </div>
            <h2 className="section-gap">Collection ledger</h2>
            <div className="table-scroll panel">
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {admin.runs.length ? (
                    admin.runs.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{new Date(r.started_at).toLocaleString('en-IN')}</td>
                        <td>
                          <span className="status-pill">{r.status}</span>
                        </td>
                        <td>{r.observations}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        No worker runs yet. Start the local worker to collect synthetic
                        observations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="notice">
              <ShieldCheck size={21} />
              <span>
                Operator mutations require a server-configured ADMIN_TOKEN. The browser never
                receives that token. Production admin identity, MFA, matching review, and provider
                credentials are pending live infrastructure.
              </span>
            </div>
          </>
        ) : (
          <p>Loading source status…</p>
        )}
      </section>
    );
  }
  function HelpPage() {
    return (
      <section className="page-width utility-page narrow">
        <PageHeading
          eyebrow="CLARITY IS THE WHOLE POINT"
          title="A considered way to buy."
          description="Price Atlas brings the product, the price, and the context into one clear view."
        />
        <div className="help-intro">
          <ShieldCheck size={38} />
          <p>
            Every comparison should answer one question honestly:{' '}
            <strong>is this the same product, at a better eligible price?</strong>
          </p>
        </div>
        {[
          [
            'What am I seeing in this demo?',
            'Eight synthetic catalog fixtures, illustrative artwork, and simulated prices for two familiar store names. These are not live retailer prices or purchase recommendations. The local background worker creates new synthetic observations every minute.',
          ],
          [
            'How do you decide the lowest price?',
            'We compare fresh, accepted, in-stock offers for the exact variant in INR. Delivered totals include item price, known mandatory shipping and charges, minus confirmed unconditional discounts. A missing shipping charge is unknown, never silently zero.',
          ],
          [
            'Are bank offers included?',
            'Card discounts, exchange estimates, membership deals and coupons that need an action are excluded from the default ranking and target. They require separate, explicit conditions.',
          ],
          [
            'What makes a match exact?',
            'Model, memory, storage, color, condition, quantity and category-specific identity must agree. A cheaper different-storage phone is a different variant. Missing decisive evidence goes to review rather than automatic acceptance.',
          ],
          [
            'How do price alerts work?',
            'Set an at-or-below target. A fresh qualifying observation creates an in-app event. Repeated low prices do not send a new event every check. Stale periods do not reset an episode. Two fresh above-target observations and a 24-hour cooldown are required to re-arm.',
          ],
          [
            'What does the chart tell me?',
            'The chart shows synthetic recorded checks in this demo. Live history must come from permitted retained observations. Gaps are not filled with invented prices, and a limited history never establishes an all-time low.',
          ],
          [
            'Can I paste a retailer link?',
            'Direct Amazon.in product links and Flipkart links with a product ID are validated without making network requests. Resolving them into live catalog records requires a connected authorized source. Short links remain unsupported until redirect validation is configured.',
          ],
          [
            'How are purchases and affiliate links handled?',
            'Purchases will take place at the retailer. This demo has no purchase destinations or affiliate attribution. Future commission arrangements must never influence cheapest-offer ranking.',
          ],
          [
            'What is needed for the live service?',
            'Approved data providers with comparison, history and alert rights; production PostgreSQL, identity and job infrastructure; an email sending domain; and deployment accounts. These external connections are not represented as complete.',
          ],
        ].map(([q, a]) => (
          <details className="faq" key={q}>
            <summary>
              {q}
              <Plus size={17} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
        <div className="notice">
          <Link2 size={20} />
          <span>
            Found an incorrect match or price? Open the product and choose “Report a price or match
            issue.” Your report is stored with a support reference.
          </span>
        </div>
      </section>
    );
  }
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Search;
  title: string;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={31} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function SearchBox({
  hero = false,
  query,
  setQuery,
  search,
  products,
}: {
  hero?: boolean;
  query: string;
  setQuery: (value: string) => void;
  search: (e: FormEvent) => void;
  products: Product[];
}) {
  return (
    <form className={`search-box ${hero ? 'hero-search' : ''}`} onSubmit={search}>
      <Search size={20} />
      <input
        aria-label="Search products or paste a retailer link"
        placeholder="Search a product or paste a link"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        list={hero ? 'hero-suggestions' : 'search-suggestions'}
      />
      <datalist id={hero ? 'hero-suggestions' : 'search-suggestions'}>
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <button className="primary" type="submit" aria-label="Search">
        {hero ? 'Find my price' : <Search size={18} />} {hero && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
