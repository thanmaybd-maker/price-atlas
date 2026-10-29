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
  Sparkles,
  Droplets,
  House,
  Plug,
  Mouse,
  Shirt,
  BookOpen,
  Pencil,
  Sun,
  Moon,
} from 'lucide-react';
import {
  money,
  rank,
  total,
  eligible,
  STORE_NAMES,
  type Product,
  type Offer,
  type Rule,
  type Category,
} from '@domain/index';
import { ProductArt } from './product-art';
import { PriceChart } from './chart';
import { LiveLogin } from './live-login';
import { Operations } from './operations';
import { Mfa } from './mfa';
import { TelegramSettings } from './telegram-settings';
import { RingHero } from './ring-hero';
import { SearchFlower } from './search-flower';
import { WeekLedger } from './week-ledger';
import dynamic from 'next/dynamic';
import { TidesWorld } from './tides-world';
import { CategoriesBoard } from './categories-board';
// The home "worlds" sit below the fold; loading them after the page is interactive keeps the
// search box responsive on first paint.
const HomeWorlds = dynamic(() => import('./home-worlds').then((m) => m.HomeWorlds), {
  ssr: false,
});
import { RecentHistory } from './recent-history';
import { matchesQuery } from '../../../packages/domain/search';
import { retailers } from '../../../packages/domain/retailers';
import { variantLabel } from '../../../packages/domain/variant-guard';
import type { SearchCandidate } from '../../../packages/providers/search';
import { historyEvidence } from '../../../packages/domain/evidence';
import { localState, sessionState } from '../lib/browser-storage';
import { visiblePoll } from '../lib/visible-poll';
import { fetchJson } from '../lib/fetch-json';
import type { PinDraft } from './home-worlds';
import { historyCoverage } from '../../../packages/domain/history-coverage';
import { ExternalHistory } from './external-history';
type User = {
  id: string;
  name: string;
  notifications: number;
  email?: string;
  email_enabled?: boolean;
};
type Session = {
  user: User | null;
  delivery?: { emailAvailable: boolean };
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
  listings?: {
    id: string;
    product_id: string;
    store: string;
    match_state: string;
    failures: number;
  }[];
  quarantine?: { id: string; listing_id: string; reason: string }[];
  jobs?: { id: string; last_error: string; attempts: number }[];
  telegram?: { notification_id: string; state: string; last_error: string; attempts: number }[];
  capabilities?: {
    source: string;
    history: boolean;
    alerts: boolean;
    agreementReference: string | null;
  }[];
};
const categories: { id: Category; name: string; icon: typeof Smartphone }[] = [
  { id: 'phones', name: 'Phones', icon: Smartphone },
  { id: 'laptops', name: 'Laptops', icon: Laptop },
  { id: 'audio', name: 'Audio', icon: Headphones },
  { id: 'tablets', name: 'Tablets', icon: Tablet },
  { id: 'monitors', name: 'Monitors', icon: Monitor },
  { id: 'beauty', name: 'Beauty & cosmetics', icon: Sparkles },
  { id: 'personal-care', name: 'Skin & hair care', icon: Droplets },
  { id: 'home-kitchen', name: 'Home & kitchen', icon: House },
  { id: 'appliances', name: 'Appliances', icon: Plug },
  { id: 'accessories', name: 'Computer accessories', icon: Mouse },
  { id: 'fashion', name: 'Fashion', icon: Shirt },
  { id: 'books', name: 'Books', icon: BookOpen },
  { id: 'stationery', name: 'Stationery', icon: Pencil },
  { id: 'services', name: 'Warranty & services', icon: ShieldCheck },
  { id: 'other', name: 'Other products', icon: LayoutGrid },
];
const empty: Session = { user: null, watches: [], rules: [], notifications: [] };
async function api(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
  return fetchJson(
    `/api/v1/${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    method === 'GET' ? 15000 : 30000,
  );
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
  mode = 'demo',
  initialProducts,
  initialOffers,
  initialHistory,
}: {
  route: string[];
  mode?: 'demo' | 'live';
  initialProducts: Product[];
  initialOffers: Offer[];
  initialHistory: Offer[];
}) {
  const demo = mode === 'demo';
  const compareStorageKey = demo ? 'atlas-compare' : 'atlas-compare-live';
  const router = useRouter();
  const params = useSearchParams();
  const page = route[0] || 'home';
  const [products, setProducts] = useState(initialProducts);
  const [offers, setOffers] = useState(initialOffers);
  const [session, setSession] = useState<Session>(empty);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [themeReady, setThemeReady] = useState(false);
  const [pinDraft, setPinDraft] = useState<PinDraft>();
  const [query, setQuery] = useState(params.get('q') || '');
  const [toast, setToast] = useState('');
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<{
    query: string;
    busy: boolean;
    ids: string[];
    message: string;
    candidates: SearchCandidate[];
    searchLinks?: { store: (typeof STORE_NAMES)[number]; url: string }[];
  }>({ query: '', busy: false, ids: [], message: '', candidates: [] });
  const [compare, setCompare] = useState<string[]>([]);
  const [history, setHistory] = useState(initialHistory);
  const [range, setRange] = useState(
    [7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30,
  );
  const [historyBasis, setHistoryBasis] = useState<'item' | 'delivered'>(
    params.get('basis') === 'delivered' ? 'delivered' : 'item',
  );
  const [adminError, setAdminError] = useState('');
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [menu, setMenu] = useState(false);
  const [collection, setCollection] = useState('All collections');
  const [reportProduct, setReportProduct] = useState<Product | null>(null);
  const [heroStore, setHeroStore] = useState('all');
  const [bloom, setBloom] = useState(false);
  const [lookupVersion, setLookupVersion] = useState(0);
  const pending = useRef<(() => void) | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const current = products.find((p) => p.slug === route[1] || p.id === route[1]);
  const category = page === 'category' ? route[1] : params.get('category') || '';
  const sort = params.get('sort') || 'recommended';
  const brand = params.get('brand') || '';
  const maximum = Number(params.get('max') || 0);
  const searchText = params.get('q') || '';
  const searchStore = params.get('store') || 'all';
  useEffect(() => {
    if (demo || page !== 'search' || searchText.trim().length < 2) return;
    let active = true;
    const controller = new AbortController();
    setLookup({ query: searchText, busy: true, ids: [], message: '', candidates: [] });
    void (async () => {
      const response = await fetch('/api/v1/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchText,
          store: searchStore,
          searchMore: params.get('verify') === '1',
        }),
        signal: controller.signal,
      });
      let result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Product lookup is temporarily unavailable.');
      for (let attempt = 0; result.state === 'pending' && attempt < 30 && active; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await fetch(
          `/api/v1/discovery?q=${encodeURIComponent(searchText)}&store=${encodeURIComponent(searchStore)}`,
          {
            signal: controller.signal,
          },
        );
        result = await status.json();
        if (!status.ok)
          throw new Error(result.error || 'Unable to read lookup status. Please retry.');
      }
      if (!active) return;
      if (result.state === 'pending' || result.state === 'missing')
        throw new Error(
          'The retailer check is taking longer than expected. Recorded results remain available; retry shortly for its final status.',
        );
      const found = (result.products || []) as Product[];
      const incoming = (result.offers || []) as Offer[];
      setProducts((prior) => [...found, ...prior.filter((p) => !found.some((f) => f.id === p.id))]);
      setOffers((prior) => [
        ...incoming,
        ...prior.filter((o) => !incoming.some((f) => f.id === o.id)),
      ]);
      setLookup({
        query: searchText,
        busy: false,
        ids: found.map((p) => p.id),
        message:
          result.message ||
          (found.length
            ? `${found.length} product${found.length === 1 ? '' : 's'} found. Prices and availability are from recorded retailer checks.`
            : 'No verified details found. Try a specific model name or retailer product URL.'),
        candidates: result.candidates || [],
        searchLinks: result.searchLinks || [],
      });
      if (/^https?:\/\//i.test(searchText) && found[0]) router.push(`/p/${found[0].slug}`);
    })().catch((error) => {
      if (active)
        setLookup({
          query: searchText,
          busy: false,
          ids: [],
          message: error instanceof Error ? error.message : 'Unable to check products.',
          candidates: [],
        });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [demo, page, searchText, searchStore, params.get('verify'), lookupVersion, router]);
  useEffect(() => {
    if (!demo && page === 'search' && searchText.trim().length >= 2) setBloom(true);
    else setBloom(false);
  }, [demo, page, searchText, searchStore]);
  async function refresh() {
    const result = await api('session');
    setSession(result);
    if (result.user && !demo) {
      const raw = sessionState.getItem('atlas-pending-intent');
      if (raw) {
        sessionState.removeItem('atlas-pending-intent');
        try {
          const intent = JSON.parse(raw);
          if (intent.type === 'pin' || intent.type === 'target') {
            const product = initialProducts.find((p) => p.id === intent.productId);
            if (product) {
              const draft = {
                productId: product.id,
                target: Math.round(Number(intent.target) * 100),
                store: intent.scope || 'all',
                basis: intent.basis || 'item',
                id: intent.id,
              } as PinDraft;
              setPinDraft(draft);
              router.push(`/?pin=${encodeURIComponent(product.id)}#targets`);
              if (intent.type === 'pin')
                await commitPin(
                  product,
                  Number(intent.target),
                  draft.store!,
                  draft.basis!,
                  draft.id,
                );
            }
          } else if (intent.type === 'import') {
            setQuery(intent.url);
            notify('You’re signed in. Submit the product link to import it.');
          } else if (intent.type === 'watch') {
            await api('watches', 'POST', { productId: intent.productId });
            setSession(await api('session'));
          }
        } catch {}
      }
    }
  }
  useEffect(() => {
    void refresh().catch(() => setToast('Unable to load your session. Check your connection.'));
    const stored = localState.getItem(compareStorageKey);
    if (stored)
      try {
        const selected = JSON.parse(stored);
        if (Array.isArray(selected))
          setCompare(selected.filter((id) => initialProducts.some((p) => p.id === id)).slice(0, 4));
      } catch {}
    changeTheme(localState.getItem('atlas-theme') === 'dark' ? 'dark' : 'light');
    setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    setQuery(params.get('q') || '');
    setHistory(initialHistory);
    setRange([7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30);
    setHistoryBasis(params.get('basis') === 'delivered' ? 'delivered' : 'item');
    setProducts(initialProducts);
    setOffers(initialOffers);
    setMenu(false);
  }, [params, initialHistory]);
  useEffect(() => {
    if (page === 'admin')
      void api('admin')
        .then(setAdmin)
        .catch((e) => {
          setAdminError(e.message);
          setToast(e.message);
        });
  }, [page]);
  useEffect(() => {
    let active = true;
    const stop = visiblePoll(async () => {
      const result = await api(current ? `products/${current.id}?days=90` : 'offers');
      if (!active) return;
      if (current) {
        setHistory(result.history);
        setOffers((prior) => [
          ...result.offers,
          ...prior.filter((o) => o.productId !== current.id),
        ]);
      } else setOffers(result.offers);
      if (session.user) {
        const next = await api('session');
        if (active) setSession(next);
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [current?.id, session.user?.id]);
  useEffect(() => {
    if (!(auth || reportProduct)) return;
    const previous = document.activeElement as HTMLElement;
    const id = setTimeout(
      () => modalRef.current?.querySelector<HTMLElement>('input,button')?.focus(),
      30,
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuth(false);
        sessionState.removeItem('atlas-pending-intent');
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
  }, [auth, reportProduct]);
  function notify(message: string) {
    setToast(message);
  }
  function changeTheme(value: 'light' | 'dark') {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    localState.setItem('atlas-theme', value);
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
    if (!demo && !session.user)
      sessionState.setItem(
        'atlas-pending-intent',
        JSON.stringify({ type: 'watch', productId: p.id }),
      );
    requireUser(
      () =>
        void perform(async () => {
          await api(saved(p.id) ? `watches/${p.id}` : 'watches', saved(p.id) ? 'DELETE' : 'POST', {
            productId: p.id,
          });
          const wasSaved = saved(p.id);
          setSession((prior) => ({
            ...prior,
            watches: wasSaved
              ? prior.watches.filter((watch) => watch.product_id !== p.id)
              : [...prior.watches, { id: p.id, product_id: p.id, collection: 'My shortlist' }],
          }));
          notify(wasSaved ? 'Removed from your shortlist.' : 'Saved to your shortlist.');
        }),
    );
  }
  function openTarget(p: Product, rule?: Rule) {
    setPinDraft({
      productId: p.id,
      ...(rule ? { id: rule.id, target: rule.target, store: rule.store, basis: rule.basis } : {}),
    });
    router.push(
      `/?pin=${encodeURIComponent(p.id)}${rule ? `&rule=${encodeURIComponent(rule.id)}` : ''}#targets`,
    );
  }
  async function commitPin(
    p: Product,
    rupees: number,
    store: string,
    priceBasis: 'delivered' | 'item',
    ruleId?: string,
  ) {
    const result = await api('rules', ruleId ? 'PATCH' : 'POST', {
      ...(ruleId ? { id: ruleId } : {}),
      productId: p.id,
      target: Math.round(rupees * 100),
      store,
      basis: priceBasis,
      operator: 'lte',
      enabled: true,
    });
    setSession((prior) => ({
      ...prior,
      rules: [...prior.rules.filter((rule) => rule.id !== result.rule.id), result.rule],
      watches: prior.watches.some((watch) => watch.product_id === p.id)
        ? prior.watches
        : [...prior.watches, { id: p.id, product_id: p.id, collection: 'My shortlist' }],
    }));
    sessionState.removeItem('atlas-pending-intent');
    setPinDraft(undefined);
    notify('Target pinned. Only fresh matching checks can trigger it.');
  }
  async function pinTarget(
    p: Product,
    rupees: number,
    store: string,
    priceBasis: 'delivered' | 'item',
    ruleId?: string,
  ) {
    if (!Number.isFinite(rupees) || rupees < 1 || rupees > 100000000)
      throw new Error('Enter a target between ₹1 and ₹10,00,00,000.');
    if (!session.user) {
      sessionState.setItem(
        'atlas-pending-intent',
        JSON.stringify({
          type: 'pin',
          productId: p.id,
          target: rupees,
          scope: store,
          basis: priceBasis,
          id: ruleId,
        }),
      );
      pending.current = () =>
        void commitPin(p, rupees, store, priceBasis, ruleId).catch((error) =>
          notify(error.message),
        );
      setAuth(true);
      return false;
    }
    await commitPin(p, rupees, store, priceBasis, ruleId);
    return true;
  }
  function toggleCompare(id: string) {
    const next = compare.includes(id) ? compare.filter((v) => v !== id) : [...compare, id];
    if (next.length > 4) {
      notify('Compare up to four exact variants at a time.');
      return;
    }
    setCompare(next);
    localState.setItem(compareStorageKey, JSON.stringify(next));
  }
  function navigateFilter(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    p.delete('page');
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`/${page === 'category' ? `category/${category}` : 'search'}?${p}`);
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    const storeParam = heroStore !== 'all' ? `&store=${encodeURIComponent(heroStore)}` : '';
    if (!demo) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}${storeParam}`);
      return;
    }
    if (/^https?:\/\//i.test(query)) {
      if (!demo && !session.user) {
        sessionState.setItem(
          'atlas-pending-intent',
          JSON.stringify({ type: 'import', url: query }),
        );
        setAuth(true);
        return;
      }
      await perform(async () => {
        const result = await api('imports', 'POST', { url: query });
        if (result.product) router.push(`/p/${result.product.slug}`);
      });
    } else router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  const priceFor = (p: Product) => {
    const po = offers.filter((o) => o.productId === p.id);
    return rank(po).lowest ?? rank(po, Date.now(), 'item').lowest ?? Infinity;
  };
  let filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!params.get('q') ||
        (lookup.query === searchText && lookup.ids.includes(p.id)) ||
        matchesQuery(p, params.get('q') || '')) &&
      (!brand || p.brand === brand) &&
      (searchStore === 'all' ||
        p.attributes.Retailer === searchStore ||
        offers.some((o) => o.productId === p.id && o.store === searchStore)) &&
      (!maximum || priceFor(p) <= maximum * 100),
  );
  if (sort.startsWith('price'))
    filtered = filtered.sort(
      (a, b) => (priceFor(a) - priceFor(b)) * (sort === 'price-desc' ? -1 : 1),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(pageCount, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  function Card({ p, index = 0 }: { p: Product; index?: number }) {
    const po = offers.filter((o) => o.productId === p.id);
    const r = rank(po);
    const itemRank = rank(po, Date.now(), 'item');
    const lastObserved = po
      .filter((o) => o.displayAllowed)
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    return (
      <article key={p.id} className="product-card" style={{ animationDelay: `${index * 45}ms` }}>
        <div className="card-art">
          <Link prefetch={false} href={`/p/${p.slug}`} tabIndex={-1} aria-hidden="true">
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
          <Link prefetch={false} className="product-name" href={`/p/${p.slug}`}>
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
                    : itemRank.offers.length
                      ? 'Item price · delivery extra/unknown'
                      : lastObserved
                        ? `Last observed · ${new Date(lastObserved.observedAt).toLocaleDateString('en-IN')}`
                        : p.attributes['Source price']
                          ? 'Source price · shipping/import fees extra'
                          : 'Currently unavailable'}
              </span>
              <strong className="card-price">
                {p.attributes['Source price'] && !po.length
                  ? p.attributes['Source price']
                  : money(r.lowest ?? itemRank.lowest ?? lastObserved?.itemPrice ?? null)}
              </strong>
            </div>
            <span className="micro-trend">
              <TrendingDown size={22} />
            </span>
          </div>
          <div className="card-bottom">
            <span>
              <i className="store-dot" /> {Math.max(r.offers.length, itemRank.offers.length)}{' '}
              available offers
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
        <span className="demo-dot" />{' '}
        {demo
          ? 'You’re exploring the demo. All prices and products are synthetic fixtures.'
          : 'Live retailer tracking · recorded prices and stock can change at checkout.'}{' '}
        <Link prefetch={false} href="/help">
          How it works <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link prefetch={false} className="wordmark" href="/" aria-label="Price Atlas home">
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
              prefetch={false}
              className={['home', 'search', 'category', 'p'].includes(page) ? 'active' : ''}
              href="/search"
            >
              Discover
            </Link>
            <Link
              prefetch={false}
              className={page === 'watchlist' ? 'active' : ''}
              href="/watchlist"
            >
              Watchlist{' '}
              {session.watches.length > 0 && (
                <span className="nav-count">{session.watches.length}</span>
              )}
            </Link>
            <Link
              prefetch={false}
              className={page === 'compare' ? 'active' : ''}
              href={`/compare?items=${compare.join(',')}`}
            >
              Compare
            </Link>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button appearance-toggle"
              aria-label={theme === 'dark' ? 'Use Light theme' : 'Use Dark theme'}
              disabled={!themeReady}
              onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              prefetch={false}
              className="icon-button notification-link"
              href="/alerts"
              aria-label="Price alerts"
            >
              <Bell size={20} />
              {session.notifications.some((n) => n.state === 'delivered') && <i />}
            </Link>
            <span className="header-divider" />
            {session.user ? (
              <Link
                prefetch={false}
                className="avatar"
                href="/settings"
                aria-label="Account settings"
              >
                {session.user.name.slice(0, 1).toUpperCase()}
              </Link>
            ) : (
              <button className="sign-in" onClick={() => setAuth(true)}>
                {demo ? 'Try demo' : 'Sign in'} <ArrowUpRight size={15} />
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
        {!demo && <RecentHistory query={searchText} product={page === 'p' ? current : undefined} />}
        {page === 'home' ? (
          <>
            <section className="v2-hero page-width">
              <div className="v2-copy">
                <h1>
                  The right product. <span>The better price.</span>
                </h1>
                <p className="v2-lede">
                  Search across ten retailers. Compare recorded prices for matching variants.
                </p>
                <SearchBox
                  hero
                  query={query}
                  setQuery={setQuery}
                  search={search}
                  products={products}
                />
                <div className="v2-stores" role="group" aria-label="Retailer scope">
                  {['all', ...STORE_NAMES].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`v2-store${heroStore === st ? ' on' : ''}`}
                      aria-pressed={heroStore === st}
                      onClick={() => setHeroStore(st)}
                    >
                      {st === 'all' ? 'All' : st === 'Amazon' ? 'Amazon.in' : st}
                    </button>
                  ))}
                </div>
                <p className="v2-hint">
                  {demo
                    ? 'You’re exploring the demo. All prices and products are synthetic fixtures.'
                    : 'Name searches are free. A pasted product link may use a paid check, capped at ten credits.'}
                </p>
              </div>
              <div className="v2-art">
                <RingHero theme={theme} />
              </div>
            </section>
            <section className="v2-cats page-width" aria-labelledby="v2-cats-title">
              <div className="v2-cats-head">
                <h2 id="v2-cats-title">Shop by category</h2>
                <Link prefetch={false} href="/categories">
                  See every category
                </Link>
              </div>
              <div className="v2-cat-grid">
                {categories.map((c) => (
                  <Link prefetch={false} className="v2-cat" key={c.id} href={`/category/${c.id}`}>
                    <c.icon size={30} strokeWidth={1.8} />
                    <span>{c.name}</span>
                  </Link>
                ))}
              </div>
            </section>
            <HomeWorlds
              products={products}
              offers={offers}
              watches={session.watches}
              rules={session.rules}
              notifications={session.notifications}
              emailAvailable={Boolean(session.delivery?.emailAvailable)}
              onSave={save}
              onPin={pinTarget}
              initialTarget={
                pinDraft ||
                (params.get('pin')
                  ? {
                      productId: params.get('pin')!,
                      ...session.rules.find((rule) => rule.id === params.get('rule')),
                    }
                  : undefined)
              }
            />
            <section className="discovery-section page-width">
              <div className="section-heading">
                <div>
                  <h2>A little closer to your next upgrade.</h2>
                </div>
                <Link prefetch={false} className="text-link" href="/search">
                  Explore all products <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="product-grid">
                {products.slice(0, 4).map((p, i) => Card({ p, index: i }))}
                {!products.length && (
                  <p>No imported products yet. Add a supported retailer link to begin.</p>
                )}
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
                <Link prefetch={false} href="/help" className="text-link">
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
        ) : page === 'categories' ? (
          <CategoriesBoard />
        ) : page === 'search' || page === 'category' ? (
          <section className="page-width results-page">
            <div className="breadcrumbs">
              <Link prefetch={false} href="/">
                Home
              </Link>
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
            {!demo && searchText && (
              <section aria-label="Live product lookup">
                <p role="status" aria-live="polite">
                  {lookup.query === searchText && lookup.busy
                    ? 'Checking retailer results and product details…'
                    : lookup.query === searchText
                      ? lookup.message
                      : ''}
                </p>
                {lookup.query === searchText && lookup.candidates.length > 0 && (
                  <details>
                    <summary>Discovery links · live prices unverified</summary>
                    <ul>
                      {lookup.candidates.map((c) => (
                        <li key={c.url}>
                          <Link prefetch={false} href={`/search?q=${encodeURIComponent(c.url)}`}>
                            Verify details: {c.title}
                          </Link>{' '}
                          · {c.store}
                        </li>
                      ))}
                    </ul>
                    <p className="fine-print">
                      Selecting a product verifies its direct URL. A paid fallback may use up to 10
                      credits if free fetching fails.
                    </p>
                  </details>
                )}
                {lookup.query === searchText && !lookup.busy && (
                  <>
                    <button
                      className="outline-button"
                      onClick={() => {
                        setBloom(true);
                        if (params.get('verify') === '1') setLookupVersion((v) => v + 1);
                        else navigateFilter('verify', '1');
                      }}
                    >
                      {/^https?:\/\//i.test(searchText)
                        ? 'Deep Verify this URL'
                        : 'Search more stores for free'}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        const url = new URL(location.href);
                        url.searchParams.delete('verify');
                        void navigator.clipboard
                          .writeText(url.href)
                          .then(() => notify('Shareable link copied.'))
                          .catch(() => notify('Copy the link from your address bar.'));
                      }}
                    >
                      Copy Shareable Link
                    </button>
                    {Boolean(lookup.searchLinks?.length) && (
                      <details>
                        <summary>Search directly on stores · prices unverified</summary>
                        <ul>
                          {lookup.searchLinks?.map((link) => (
                            <li key={link.store}>
                              <a href={link.url} target="_blank" rel="noopener noreferrer">
                                Search {link.store}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </section>
            )}
            <div className="category-tabs">
              <Link
                prefetch={false}
                className={`category-tab ${!category ? 'selected' : ''}`}
                href="/search"
              >
                <LayoutGrid size={17} />
                All products
              </Link>
              {categories.map((c) => (
                <Link
                  prefetch={false}
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
                {!demo && (
                  <>
                    <label className="sr-only" htmlFor="retailer">
                      Retailer
                    </label>
                    <select
                      id="retailer"
                      value={searchStore}
                      onChange={(e) => navigateFilter('store', e.target.value)}
                    >
                      <option value="all">All retailers</option>
                      {STORE_NAMES.map((store) => (
                        <option key={store} value={store}>
                          {store}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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
            {bloom && (
              <SearchFlower
                key={`${searchText}:${searchStore}`}
                query={searchText}
                busy={lookup.query !== searchText || lookup.busy}
                found={lookup.query === searchText ? lookup.ids.length : 0}
                message={lookup.query === searchText ? lookup.message : ''}
                onDone={() => setBloom(false)}
              />
            )}
            {bloom ? null : filtered.length ? (
              <div className="product-grid">
                {filtered
                  .slice((currentPage - 1) * 24, currentPage * 24)
                  .map((p, i) => Card({ p, index: i }))}
              </div>
            ) : (
              <Empty
                icon={Search}
                title={
                  !demo && lookup.query === searchText && lookup.busy
                    ? 'Checking products…'
                    : 'No exact match this time.'
                }
                text={
                  demo
                    ? 'Try a model name, clear a filter, or explore another category. The demo has eight carefully defined variants.'
                    : lookup.query === searchText && lookup.busy
                      ? 'Searching supported retailers and verifying product details. This can take a few seconds.'
                      : 'Try a more specific model name, clear a filter, or paste a direct supported retailer product URL.'
                }
                action={
                  <Link prefetch={false} className="primary" href="/search">
                    Clear filters <ArrowRight size={16} />
                  </Link>
                }
              />
            )}
            {!bloom && pageCount > 1 && (
              <nav aria-label="Product pages" className="filter-bar">
                <button
                  className="outline-button"
                  disabled={currentPage === 1}
                  onClick={() => navigateFilter('page', String(currentPage - 1))}
                >
                  Previous page
                </button>
                <span>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  className="outline-button"
                  disabled={currentPage === pageCount}
                  onClick={() => navigateFilter('page', String(currentPage + 1))}
                >
                  Next page
                </button>
              </nav>
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
                        <Link prefetch={false} className="watch-art" href={`/p/${p.slug}`}>
                          <ProductArt product={p} />
                        </Link>
                        <div className="watch-main">
                          <span className="eyebrow">{w.collection}</span>
                          <Link prefetch={false} className="product-name" href={`/p/${p.slug}`}>
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
                  <Link prefetch={false} className="primary" href="/search">
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
                          <Link prefetch={false} className="product-name" href={`/p/${p.slug}`}>
                            {p.name}
                          </Link>
                          <p className="muted small">
                            At or below {money(rule.target)} ·{' '}
                            {rule.store === 'all'
                              ? demo
                                ? 'Both demo sources'
                                : 'All matching stores'
                              : rule.store}
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
                            {n.state} · {demo ? 'demo in-app alert' : 'price alert'}
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
                  <Link prefetch={false} className="primary" href="/search">
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
                <Link prefetch={false} className="primary" href="/">
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
            <Link prefetch={false} className="wordmark" href="/">
              PRICE<span className="atlas-word">ATLAS</span>
              <span className="brand-period">.</span>
            </Link>
            <p>Good research. Better decisions.</p>
          </div>
          <div className="footer-links">
            <Link prefetch={false} href="/about">
              Our approach
            </Link>
            <Link prefetch={false} href="/help">
              Help & methodology
            </Link>
            <Link prefetch={false} href="/admin">
              Source status
            </Link>
            <Link prefetch={false} href="/settings">
              Your preferences
            </Link>
          </div>
        </div>
        <div className="page-width footer-bottom">
          <span>© 2026 Price Atlas · Made for the considered buyer.</span>
          <span>
            India · INR ₹ <span className="footer-separator">/</span>{' '}
            {demo
              ? 'Synthetic demo · Illustrative artwork'
              : 'Imported observations · prices may change'}
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
          <Link prefetch={false} href={`/compare?items=${compare.join(',')}`} className="primary">
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
      {(auth || reportProduct) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAuth(false);
              sessionState.removeItem('atlas-pending-intent');
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
                sessionState.removeItem('atlas-pending-intent');
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
                  {demo
                    ? 'Create a local demo profile to save products and try price alerts. No email or password needed.'
                    : 'Sign in with a verified email to keep your shortlist and targets across devices.'}
                </p>
                {!demo ? (
                  <LiveLogin
                    returnTo={`/${route.join('/')}${params.toString() ? '?' + params.toString() : ''}`}
                  />
                ) : (
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
                )}
                {demo && (
                  <p className="fine-print">
                    This is a browser-bound demo session. Google and email sign-in will be available
                    after identity services are connected.
                  </p>
                )}
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
    const international = po.filter((o) => retailers[o.store].international);
    const domestic = po.filter((o) => !retailers[o.store].international);
    const variantOffers = domestic.filter((o) => o.condition !== 'new' || !o.accepted);
    const primaryOffers = domestic.filter((o) => o.condition === 'new' && o.accepted);
    const lastObserved = po
      .filter((o) => o.displayAllowed)
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    const r = rank(po);
    const itemRank = rank(po, Date.now(), 'item');
    const rule = session.rules.find((r) => r.productId === p.id);
    const comparableHistory = history.filter(
      (o) =>
        o.currency === 'INR' &&
        !retailers[o.store].international &&
        o.accepted &&
        o.condition === 'new',
    );
    const visibleHistory = comparableHistory.filter(
      (o) => o.observedAt >= Date.now() - range * 86400000,
    );
    const historyPrices = visibleHistory
      .filter((o) => o.historyAllowed && o.stock)
      .map((o) => total(o, historyBasis))
      .filter((value): value is number => value !== null);
    return (
      <section className="page-width detail-page">
        <div className="breadcrumbs">
          <Link prefetch={false} href="/">
            Home
          </Link>
          <span>/</span>
          <Link prefetch={false} href={`/category/${p.category}`}>
            {categories.find((c) => c.id === p.category)?.name}
          </Link>
          <span>/</span>
          {p.name}
        </div>
        <div className="detail-grid">
          <div>
            <div className="detail-art">
              <span className="detail-art-label">
                <ShieldCheck size={14} />{' '}
                {p.attributes['Verification status'] === 'PARTIAL_UNVERIFIED'
                  ? 'PARTIAL · UNVERIFIED'
                  : 'LISTING VARIANT'}
              </span>
              <ProductArt product={p} hero />
              <span className="art-caption">
                {demo ? 'Illustrative demo artwork' : 'Retailer-supplied image'}
              </span>
            </div>
            <div className="detail-thumbs">
              <span>
                <ProductArt product={p} />
              </span>
              <p>
                {demo ? 'Every detail matched.' : 'Identity from the imported listing.'}
                <br />
                <strong>
                  {demo
                    ? 'No smaller storage. No different color.'
                    : 'Missing attributes require review.'}
                </strong>
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
              {!demo && <span>{variantLabel(p.name, p.attributes)}</span>}
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
                    : itemRank.offers.length
                      ? 'Listed item price · delivery extra/unknown'
                      : p.attributes['Source price']
                        ? 'Source price · shipping/import fees extra'
                        : lastObserved
                          ? 'Observed item price · no eligible offer confirmed'
                          : 'No fresh eligible offers'}
              </span>
              <div>
                <strong>
                  {p.attributes['Source price'] && !po.length
                    ? p.attributes['Source price']
                    : money(r.lowest ?? itemRank.lowest ?? lastObserved?.itemPrice)}
                </strong>
                <span className="status-pill">
                  {r.winners.length > 1
                    ? 'Price tie'
                    : `${Math.max(r.offers.length, itemRank.offers.length)} ${r.offers.length ? 'matching' : 'item-price'} offers`}
                </span>
              </div>
              <p>
                <span className="live-dot" />
                {po[0] ? relative(po[0].observedAt) : 'Awaiting observation'} ·{' '}
                {demo ? 'Synthetic demo prices' : 'Retailer observation'}
              </p>
            </div>
            {p.attributes['Delivery note'] && (
              <p className="muted">{p.attributes['Delivery note']}</p>
            )}
            {p.attributes['Price note'] && <p className="muted">{p.attributes['Price note']}</p>}
            {p.attributes['Source price'] && (
              <p className="muted">
                {p.attributes.Availability} · Checked{' '}
                {p.attributes['Checked at']
                  ? relative(Date.parse(p.attributes['Checked at']))
                  : 'at source'}
                . Original currency; excluded from INR comparisons and alerts.
              </p>
            )}
            {p.attributes['Product URL'] && (
              <a
                className="outline-button"
                href={p.attributes['Product URL']}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on {p.attributes.Retailer} <ExternalLink size={15} />
              </a>
            )}
            <div className="detail-actions">
              {!demo && p.attributes['Product URL'] && (
                <Link
                  prefetch={false}
                  className="outline-button"
                  href={`/search?q=${encodeURIComponent(p.attributes['Product URL'])}&verify=1`}
                >
                  Refresh / Deep Verify
                </Link>
              )}
              <button
                className="primary"
                disabled={
                  Boolean(p.attributes['Source currency']) ||
                  Boolean(
                    retailers[p.attributes.Retailer as (typeof STORE_NAMES)[number]]?.international,
                  )
                }
                onClick={() => openTarget(p, rule)}
              >
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
                aria-label={compare.includes(p.id) ? 'Remove from comparison' : 'Add to comparison'}
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
                {demo
                  ? `Both synthetic listings are assigned to the exact ${p.name} variant below. Unknown identity fields would require review before comparison.`
                  : 'Each imported listing retains its identity. Cross-store offers join only after their decisive attributes pass matching review.'}
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
            <h2>Domestic offers (INR).</h2>
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
          {primaryOffers.map((o) => (
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
                {o.displayAllowed && o.validUntil > Date.now() ? money(o.itemPrice) : 'Expired'}
              </div>
              <div>
                <span className="mobile-label">Delivery</span>
                {o.shipping === null ? 'Unknown' : o.shipping === 0 ? 'Free' : money(o.shipping)}
                {o.charges > 0 && <span>{money(o.charges)} mandatory fees</span>}
              </div>
              <div>
                <span className="mobile-label">Total</span>
                <strong>{eligible(o) ? money(total(o)) : 'Unavailable'}</strong>
                {r.winners.some((w) => w.id === o.id) && (
                  <span className="best-label">
                    {r.winners.length > 1
                      ? 'Equal lowest'
                      : r.offers.length === 1
                        ? 'Available offer'
                        : 'Lowest eligible'}
                  </span>
                )}
              </div>
              <div>
                <span className="stock-label">
                  <i />
                  {o.validUntil <= Date.now()
                    ? 'Refresh needed'
                    : o.stock
                      ? 'In stock'
                      : p.attributes.Availability === 'Not confirmed by source'
                        ? 'Stock unverified'
                        : 'Out of stock'}
                </span>
                <span>{relative(o.observedAt)}</span>
                <span>{retailers[o.store].deliveryNote}</span>
                <span>{variantLabel(p.name, { ...p.attributes, Condition: o.condition })}</span>
              </div>
              {!demo && o.purchaseUrl ? (
                <a
                  className="store-button"
                  href={o.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit {o.store} <ArrowUpRight size={16} />
                </a>
              ) : (
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
              )}
            </div>
          ))}
        </div>
        {!primaryOffers.length && (
          <p className="muted">
            No verified domestic offer is currently available for this exact variant.
          </p>
        )}
        {variantOffers.length > 0 && (
          <section>
            <h3>Other variants / conditions</h3>
            {variantOffers.map((o) => (
              <p key={o.id}>
                {o.store} · {o.condition} · {money(o.itemPrice)} · Excluded from best-price ranking{' '}
                {o.purchaseUrl && (
                  <a href={o.purchaseUrl} target="_blank" rel="noopener noreferrer">
                    Check on store
                  </a>
                )}
              </p>
            ))}
          </section>
        )}
        {(international.length > 0 || p.attributes['Source price']) && (
          <section>
            <h3>International / cross-border offers</h3>
            <p>
              Listed prices exclude unverified international shipping and import duty. Check India
              eligibility and the landed total at checkout.
            </p>
            {p.attributes['Source price'] && (
              <p>
                {p.attributes.Retailer} · {p.attributes['Source price']}{' '}
                {p.attributes['Source currency']} · {p.attributes['Checked at']}
              </p>
            )}
            {international.map((o) => (
              <p key={o.id}>
                {o.store} · {money(o.itemPrice)} INR · {relative(o.observedAt)}{' '}
                {o.purchaseUrl && (
                  <a href={o.purchaseUrl} target="_blank" rel="noopener noreferrer">
                    Check landed cost on store
                  </a>
                )}
              </p>
            ))}
          </section>
        )}
        <p className="fine-print">
          {demo
            ? 'Illustrative prices, not retailer quotes.'
            : 'Observed prices may change at checkout. Delivery location has not been personalized.'}{' '}
          Bank, exchange, membership, and coupon discounts are excluded.{' '}
          <button className="text-button" onClick={() => setReportProduct(p)}>
            Report a price or match issue
          </button>
        </p>
        <div className="hs">
          <TidesWorld
            embedded
            basis={historyBasis}
            lede="One wave per store, recorded prices only. A gap means nothing was observed that day. Drag across to read any day; pick a store to follow it."
            ridges={[...new Set(comparableHistory.map((o) => o.store))]
              .map((s) => ({
                key: s,
                name: s === 'Amazon' ? 'Amazon.in' : s,
                obs: comparableHistory.filter((o) => o.store === s),
              }))
              .sort((a, b) => b.obs.length - a.obs.length)
              .slice(0, 4)}
          />
        </div>
        <WeekLedger observations={comparableHistory} basis={historyBasis} />
        <p className="fine-print">
          {historyCoverage(comparableHistory, historyBasis, range).recordedDays} of {range} days
          have recorded {historyBasis} prices for this product. New tracking cannot supply prices
          from before its first real check.
        </p>
        <div className="history-panel">
          <ExternalHistory
            sourceUrl={
              p.attributes['Product URL'] || po.find((offer) => offer.purchaseUrl)?.purchaseUrl
            }
          />
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
          <div className="detail-actions">
            <label>
              History price basis{' '}
              <select
                aria-label="History price basis"
                value={historyBasis}
                onChange={(event) => setHistoryBasis(event.target.value as 'item' | 'delivered')}
              >
                <option value="item">Item price · shipping excluded</option>
                <option value="delivered">Delivered total · known shipping only</option>
              </select>
            </label>
            <button
              className="outline-button"
              disabled={!visibleHistory.some((o) => o.historyAllowed)}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([historyEvidence(p, visibleHistory, historyBasis)], {
                    type: 'text/csv;charset=utf-8',
                  }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = `price-atlas-${p.id}-${range}d-${historyBasis}.csv`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export history CSV
            </button>
            <button
              className="outline-button"
              onClick={() =>
                void perform(async () => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('basis', historyBasis);
                  url.searchParams.set('days', String(range));
                  await navigator.clipboard.writeText(url.toString());
                  notify('History view link copied.');
                })
              }
            >
              Copy history view link
            </button>
          </div>
          <div className="history-summary">
            <div>
              <span className="tiny-label">Lowest in shown checks</span>
              <strong>
                {historyPrices.length ? money(Math.min(...historyPrices)) : 'No comparable checks'}
              </strong>
            </div>
            <div>
              <span className="tiny-label">Your target {rule ? `· ${rule.basis} price` : ''}</span>
              <strong>{rule ? money(rule.target) : 'Make it yours'}</strong>
            </div>
            <div className="history-note">
              {demo
                ? 'Synthetic history for exploring the experience.'
                : 'Only permitted retained observations appear here.'}
              <br />
              {demo
                ? 'Real charts will start with permitted observations.'
                : 'No history means no recorded retained checks yet.'}
            </div>
          </div>
          <PriceChart
            demo={demo}
            observations={visibleHistory}
            target={rule?.basis === historyBasis ? rule.target : undefined}
            basis={historyBasis}
          />
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
                      <Link prefetch={false} className="product-name" href={`/p/${p.slug}`}>
                        {p.name}
                      </Link>
                      <p className="variant">{p.subtitle}</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          const next = selected.filter((x) => x.id !== p.id).map((x) => x.id);
                          setCompare(next);
                          localState.setItem(compareStorageKey, JSON.stringify(next));
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
              <Link prefetch={false} href="/search" className="primary">
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
          description="Your profile, notification preferences, and data controls."
        />
        <div className="settings-panel">
          <div className="setting-row">
            <div>
              <strong>Appearance</strong>
              <p className="muted small">
                Light paper or dark paper. Available without signing in.
              </p>
            </div>
            <select
              aria-label="Color theme"
              disabled={!themeReady}
              value={theme}
              onChange={(event) => changeTheme(event.target.value as 'light' | 'dark')}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        {session.user ? (
          <>
            <div className="settings-panel">
              <h2>Hello, {session.user.name}.</h2>
              <p className="muted">
                {demo ? 'Local demo profile · browser session' : session.user.email}
              </p>
              {!demo && <TelegramSettings />}
              {!demo && (
                <div className="setting-row">
                  <div>
                    <strong>Email price alerts</strong>
                    <p className="muted small">
                      {session.delivery?.emailAvailable
                        ? 'Send eligible alerts to your verified email.'
                        : 'Unavailable: no verified sender domain. Use Telegram and in-app alerts.'}
                    </p>
                  </div>
                  <button
                    className={`toggle ${session.user.email_enabled ? 'on' : ''}`}
                    role="switch"
                    aria-checked={!!session.user.email_enabled}
                    aria-label="Email price alerts"
                    disabled={!session.delivery?.emailAvailable}
                    onClick={() =>
                      void perform(async () => {
                        await api('preferences', 'PATCH', {
                          enabled: !!session.user?.notifications,
                          emailEnabled: !session.user?.email_enabled,
                        });
                        await refresh();
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
              )}
              <div className="setting-row">
                <div>
                  <strong>{demo ? 'In-app price notifications' : 'Price notifications'}</strong>
                  <p className="muted small">
                    Turning these off suppresses pending in-app, email, and Telegram alerts.
                  </p>
                </div>
                <button
                  className={`toggle ${session.user.notifications ? 'on' : ''}`}
                  role="switch"
                  aria-checked={!!session.user.notifications}
                  aria-label={demo ? 'In-app price notifications' : 'Price notifications'}
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
                  <strong>Email & Google sign-in</strong>
                  <p className="muted small">
                    {demo
                      ? 'An identity provider has not been connected in demo mode.'
                      : 'Your identity is verified by Supabase. Google requires its provider configuration.'}
                  </p>
                </div>
                <span className="status-pill paused">
                  {demo ? 'Demo mode' : 'Verified account'}
                </span>
              </div>
              {!demo && (
                <>
                  <p className="fine-print">Account ID: {session.user.id}</p>
                  <Mfa />
                </>
              )}
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
                  <p className="muted small">
                    {demo
                      ? 'A new demo session creates a separate profile.'
                      : 'You can sign back in with the same email.'}
                  </p>
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
                <summary>Delete this account</summary>
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
                      notify('Account data deleted.');
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
            text={
              demo
                ? 'Start a demo profile to manage saved products and preferences.'
                : 'Sign in to manage saved products and preferences.'
            }
            action={
              <button className="primary" onClick={() => setAuth(true)}>
                {demo ? 'Create demo profile' : 'Sign in'}
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
          description={
            demo
              ? 'Local demo operations.'
              : 'Private source operations. An approved account with MFA is required.'
          }
        />
        {admin ? (
          <>
            {!demo && (
              <Operations state={admin} reload={async () => setAdmin(await api('admin'))} />
            )}
            <div className="admin-stats">
              {Object.entries(admin.counts).map(([k, v]) => (
                <div className="panel" key={k}>
                  <span className="eyebrow">{k}</span>
                  <strong>{v.toLocaleString('en-IN')}</strong>
                </div>
              ))}
              <div className="panel">
                <span className="eyebrow">ENVIRONMENT</span>
                <strong className="mode-label">{demo ? 'Demo' : 'Live preview'}</strong>
              </div>
            </div>
            <h2>Source connections</h2>
            <div className="source-cards">
              {admin.providers.map((p) => (
                <div className="panel" key={p.store}>
                  <div className="section-heading">
                    <h3>{p.store}</h3>
                    <span className={`status-pill ${p.paused ? 'paused' : ''}`}>
                      {p.paused ? 'Paused' : demo ? 'Demo adapter' : 'Retailer collection'}
                    </span>
                  </div>
                  <p className="muted">
                    {demo
                      ? 'Synthetic catalog and observations. No live retailer requests.'
                      : 'Live retailer HTML collection. Failed observations never replace valid prices.'}
                  </p>
                  <div className="capabilities">
                    <span>
                      <Check size={13} />
                      {demo ? 'Demo prices' : 'Retailer observations'}
                    </span>
                    <span>
                      <Check size={13} />
                      {demo ? 'Demo history' : 'Source-controlled history'}
                    </span>
                    <span>
                      <Check size={13} />
                      {demo ? 'In-app alerts' : 'Configured alert channels'}
                    </span>
                  </div>
                  <p className="fine-print">
                    {demo
                      ? 'Live integrations remain separate from this demo.'
                      : 'Check source capabilities before enabling retained history and alerts. Direct purchase links have no affiliate attribution.'}
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
                {demo
                  ? 'Demo operator mutations require a server-configured ADMIN_TOKEN.'
                  : 'All operator mutations require an approved Supabase identity with MFA and leave an audit record.'}
              </span>
            </div>
          </>
        ) : (
          <p role="status">{adminError || 'Loading source status…'}</p>
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
            demo ? 'What am I seeing in this demo?' : 'Where do prices come from?',
            demo
              ? 'Eight synthetic catalog fixtures, illustrative artwork, and simulated prices for two familiar store names. These are not live retailer prices or purchase recommendations. The local background worker creates new synthetic observations every minute.'
              : 'Direct imported retailer pages, with recorded timestamps and source details. Missing stock and delivery information remains unknown. This development preview does not establish source permissions for a commercial tracking service.',
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
            'Set an at-or-below target. A fresh qualifying observation from a source that permits alerts creates a notification. Repeated low prices do not send a new event every check. Stale periods do not reset an episode. Two fresh above-target observations and a 24-hour cooldown are required to re-arm.',
          ],
          [
            'Can I get alerts on Telegram?',
            demo
              ? 'Telegram connects to verified accounts in the live app. This demo only creates local in-app notifications.'
              : 'Yes. Sign in, open Settings, choose Connect Telegram, open the private link and press Start in the bot. The link expires in ten minutes. Eligible alerts go to that chat without needing an email domain. Send /stop or disconnect in Settings to stop them. API limits, blocked bots and collection delays can affect delivery; it is not guaranteed.',
          ],
          [
            'What does the chart tell me?',
            demo
              ? 'The chart shows synthetic recorded checks in this demo. Gaps are not filled with invented prices, and a limited history never establishes an all-time low.'
              : 'The chart shows permitted retained retailer observations. If the source does not allow retention, no history is displayed. Gaps are not filled with invented prices, and a limited history never establishes an all-time low.',
          ],
          [
            'Can I paste a retailer link?',
            demo
              ? 'Direct product links are validated in demo mode. Live resolution runs in the separate live catalog.'
              : `Paste a direct product URL from ${STORE_NAMES.join(', ')}. Collection errors are shown explicitly. Short links and unsupported hosts are not fetched.`,
          ],
          [
            'How are purchases and affiliate links handled?',
            demo
              ? 'Purchases take place at the retailer. This demo has no purchase destinations.'
              : 'Visit the retailer using the product offer link. Price Atlas does not process orders. Direct links have no affiliate attribution, and commission never influences ranking.',
          ],
          [
            'What is needed for the live service?',
            demo
              ? 'The live app needs real source connections, verified accounts, a database and an operating collection worker. This demo runs separately with synthetic observations.'
              : 'The hosted app uses PostgreSQL and verified accounts. Source policies control comparison, history and alert capabilities. Reliable alerts need an operating collection worker. Telegram needs a configured bot; email to other users needs a verified sender domain. Account connection and delivery status are shown in Settings.',
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
        placeholder="Search any product or paste a retailer URL"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        list={hero ? 'hero-suggestions' : 'search-suggestions'}
      />
      <datalist id={hero ? 'hero-suggestions' : 'search-suggestions'}>
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <button
        className="primary"
        type="submit"
        aria-label={/^https?:\/\//i.test(query.trim()) ? 'Import and track product' : 'Search'}
      >
        {hero ? (
          /^https?:\/\//i.test(query.trim()) ? (
            'Import & track'
          ) : (
            'Find my price'
          )
        ) : (
          <Search size={18} />
        )}{' '}
        {hero && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
