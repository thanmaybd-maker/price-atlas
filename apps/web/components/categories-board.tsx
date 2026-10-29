'use client';
// "Every category." The sticky-note board from the design canvas (Categories.dc.html).
// Each note is one shelf: what must match before two listings count as the same product,
// a small machine animation, real searches to try, and the live product count when known.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Category } from '@domain/index';

type Note = {
  label: string;
  id: Category;
  g: 'tech' | 'care' | 'home' | 'more';
  c: string;
  k: string;
  note: string;
  m: string[];
  ex: string[];
};
const C: Note[] = [
  {
    label: 'Phones',
    id: 'phones',
    g: 'tech',
    c: 'blue',
    k: 'phone',
    note: 'Get a ping after a fresh matching check reaches your target. A 256 GB model never stands in for 128 GB.',
    m: ['Model', 'Storage', 'Memory', 'Colour'],
    ex: ['Apple iPhone 16 128 GB Black', 'Google Pixel 9 256 GB'],
  },
  {
    label: 'Laptops',
    id: 'laptops',
    g: 'tech',
    c: 'lilac',
    k: 'chip',
    note: 'An M2 and an M4 MacBook Air are different products, even at the same price.',
    m: ['Model', 'Chip', 'Memory', 'Storage'],
    ex: ['Apple MacBook Air M2 16 GB 256 GB'],
  },
  {
    label: 'Tablets',
    id: 'tablets',
    g: 'tech',
    c: 'mint',
    k: 'tab',
    note: 'A tablet sold in a bundle is still a tablet, and Wi-Fi and 5G models are never mixed.',
    m: ['Model', 'Storage', 'Wi-Fi or 5G'],
    ex: ['Apple iPad Air M2 128 GB', 'Motorola Pad 70 Pro'],
  },
  {
    label: 'Audio',
    id: 'audio',
    g: 'tech',
    c: 'lav',
    k: 'audio',
    note: 'AirPods with their case are audio, and an XM4 never stands in for an XM5.',
    m: ['Model number', 'Colour'],
    ex: ['Sony WH-1000XM5', 'Sony WF-C700N'],
  },
  {
    label: 'Monitors',
    id: 'monitors',
    g: 'tech',
    c: 'sky',
    k: 'mon',
    note: 'Screen size and resolution both have to agree.',
    m: ['Model', 'Size', 'Resolution'],
    ex: ['Samsung 24-inch QHD monitor'],
  },
  {
    label: 'Beauty & cosmetics',
    id: 'beauty',
    g: 'care',
    c: 'pink',
    k: 'lip',
    note: 'Every shade is its own product, matched shade by shade.',
    m: ['Shade', 'Size', 'Finish'],
    ex: ['Lakmé matte lipstick', 'Kay Beauty matte lipstick', 'RENEE matte lipstick'],
  },
  {
    label: 'Skin & hair care',
    id: 'personal-care',
    g: 'care',
    c: 'mint',
    k: 'shp',
    note: 'A 250 ml and a 400 ml bottle are different products. Cross-border prices retain their source currency; shipping and import costs may be extra.',
    m: ['Size', 'Variant'],
    ex: ['Minimalist face serum', 'Cetaphil relief cream'],
  },
  {
    label: 'Home',
    id: 'home-kitchen',
    g: 'home',
    c: 'peach',
    k: 'bed',
    note: 'Everyday essentials: towels, pillows, candles and cleaning supplies, matched on size, pack count and material.',
    m: ['Size', 'Pack count', 'Material'],
    ex: [
      'Cotton bath towel set of 2',
      'Double bedsheet with two pillow covers',
      'Scented candle jar',
    ],
  },
  {
    label: 'Kitchen',
    id: 'home-kitchen',
    g: 'home',
    c: 'yellow',
    k: 'kit',
    note: 'Cookware is matched on size and material: a 24 cm pan is not a 28 cm pan.',
    m: ['Size', 'Material', 'Piece count'],
    ex: ['Milton water bottle 1 L', 'Non-stick fry pan 24 cm'],
  },
  {
    label: 'Appliances',
    id: 'appliances',
    g: 'home',
    c: 'lime',
    k: 'ket',
    note: 'Kettles, irons and fryers are matched on model, wattage and capacity.',
    m: ['Model', 'Wattage', 'Capacity'],
    ex: ['Prestige electric kettle 1.5 L'],
  },
  {
    label: 'Computer accessories',
    id: 'accessories',
    g: 'tech',
    c: 'rose',
    k: 'mouse',
    note: 'A phone case is an accessory even when it names the phone.',
    m: ['Model number', 'Colour'],
    ex: ['Logitech M331 mouse'],
  },
  {
    label: 'Fashion',
    id: 'fashion',
    g: 'care',
    c: 'cream',
    k: 'rack',
    note: 'Shirts, skirts and suits. Prices can change with size, so the size you pick is part of the match.',
    m: ['Size', 'Colour', 'Fit'],
    ex: ['Formal cotton shirt', 'A-line midi skirt', 'Two-piece suit'],
  },
  {
    label: 'Books',
    id: 'books',
    g: 'more',
    c: 'sky',
    k: 'book',
    note: 'The ISBN check digit is verified, and a paperback never stands in for a hardcover.',
    m: ['ISBN-13', 'Format'],
    ex: ['Atomic Habits paperback'],
  },
  {
    label: 'Stationery',
    id: 'stationery',
    g: 'more',
    c: 'kraft',
    k: 'calc',
    note: 'One letter apart is a different calculator: fx-991CW is kept, fx-991ES Plus is not.',
    m: ['Model number'],
    ex: ['Casio fx-991CW'],
  },
  {
    label: 'Warranty & services',
    id: 'services',
    g: 'more',
    c: 'lilac',
    k: 'shield',
    note: 'A warranty plan is filed under services, never as the product it covers.',
    m: ['Plan', 'Covered product'],
    ex: ['Extended warranty for headphones'],
  },
  {
    label: 'Other products',
    id: 'other',
    g: 'more',
    c: 'peach',
    k: 'box',
    note: 'Anything verified that fits no shelf yet lands here, and still needs decisive details before two stores are compared.',
    m: ['Brand', 'Model', 'Size'],
    ex: ['Philips steam iron'],
  },
];
const GROUPS = [
  ['all', 'All'],
  ['tech', 'Tech'],
  ['care', 'Beauty, care and fashion'],
  ['home', 'Home and kitchen'],
  ['more', 'Books and more'],
] as const;
const BARS = Array.from({ length: 14 }, (_, i) => i);

function Stage({ k }: { k: string }) {
  switch (k) {
    case 'phone':
      return (
        <div className="ph2w">
          <div className="ph2">
            <i className="nf"></i>
            <div className="gr">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          </div>
          <svg className="bell" viewBox="0 0 44 44">
            <path d="M22 6c-7 0-11 5-11 12v8l-4 6h30l-4-6v-8c0-7-4-12-11-12zM18 36a4 4 0 0 0 8 0z"></path>
          </svg>
        </div>
      );
    case 'chip':
      return (
        <div className="lap">
          <i className="lid"></i>
          <i className="base"></i>
        </div>
      );
    case 'tab':
      return (
        <div className="tb2w">
          <div className="tb2">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i}></i>
            ))}
          </div>
        </div>
      );
    case 'audio':
      return (
        <div className="spk">
          <i className="cone"></i>
          <i className="rg"></i>
          <i className="rg"></i>
          <i className="rg"></i>
          <div className="wave">
            {BARS.map((b) => (
              <i key={b}></i>
            ))}
          </div>
        </div>
      );
    case 'mon':
      return (
        <div className="mon">
          <i className="scr"></i>
          <span>24 in QHD</span>
          <i className="ruler"></i>
        </div>
      );
    case 'lip':
      return (
        <div className="lip">
          <div className="tube">
            <i className="base"></i>
            <i className="ring"></i>
            <i className="bullet"></i>
          </div>
          <div className="dots">
            <i style={{ background: 'var(--sh-1)' }}></i>
            <i style={{ background: 'var(--sh-2)' }}></i>
            <i style={{ background: 'var(--sh-3)' }}></i>
            <i style={{ background: 'var(--sh-4)' }}></i>
          </div>
        </div>
      );
    case 'shp':
      return (
        <div className="shp">
          <i className="bt"></i>
          <i className="cap"></i>
          <i className="bb"></i>
          <i className="bb"></i>
          <i className="bb"></i>
        </div>
      );
    case 'bed':
      return (
        <div className="ess">
          <i className="tw a"></i>
          <i className="tw b"></i>
          <i className="tw c"></i>
          <i className="pil"></i>
          <i className="sp"></i>
          <i className="cd"></i>
          <i className="fl"></i>
        </div>
      );
    case 'kit':
      return (
        <div className="kit">
          <i className="pan"></i>
          <i className="egg"></i>
          <i className="spat"></i>
          <i className="pot"></i>
          <i className="lid"></i>
        </div>
      );
    case 'ket':
      return (
        <div className="ket">
          <i className="bd"></i>
          <i className="pf"></i>
          <i className="pf"></i>
          <i className="pf"></i>
        </div>
      );
    case 'mouse':
      return (
        <div className="mouse">
          <i className="ms"></i>
          <i className="rp"></i>
        </div>
      );
    case 'rack':
      return (
        <div className="rack">
          <i className="rail"></i>
          <div className="hang a">
            <svg viewBox="0 0 64 120">
              <path className="hk" d="M32 0 V8 M32 8 C26 8 26 2 30 2"></path>
              <path className="hk" d="M6 30 L32 12 L58 30"></path>
              <path
                className="tee"
                fill="var(--n-sky)"
                d="M14 30 L24 24 L32 30 L40 24 L50 30 L60 48 L51 52 V110 H13 V52 L4 48 Z"
              ></path>
              <path className="tee" fill="var(--white)" d="M24 24 L32 38 L40 24 L32 30 Z"></path>
              <path className="hk" d="M32 40 V104" strokeWidth="1.5"></path>
              <circle cx="32" cy="52" r="1.8" fill="var(--ink)"></circle>
              <circle cx="32" cy="70" r="1.8" fill="var(--ink)"></circle>
              <circle cx="32" cy="88" r="1.8" fill="var(--ink)"></circle>
            </svg>
          </div>
          <div className="hang b">
            <svg viewBox="0 0 64 120">
              <path className="hk" d="M32 0 V8 M32 8 C26 8 26 2 30 2"></path>
              <path className="hk" d="M6 30 L32 12 L58 30"></path>
              <path className="tee" fill="var(--a-pink)" d="M18 30 H46 V40 H18 Z"></path>
              <path className="tee" fill="var(--a-pink)" d="M18 40 H46 L60 106 H4 Z"></path>
              <path
                className="hk"
                d="M26 42 L20 104 M32 42 V104 M38 42 L44 104"
                strokeWidth="1.5"
              ></path>
            </svg>
          </div>
          <div className="hang c">
            <svg viewBox="0 0 64 120">
              <path className="hk" d="M32 0 V8 M32 8 C26 8 26 2 30 2"></path>
              <path className="hk" d="M6 30 L32 12 L58 30"></path>
              <path
                className="tee"
                fill="var(--ink)"
                d="M10 30 L24 24 L32 40 L40 24 L54 30 L60 110 H4 Z"
              ></path>
              <path className="tee" fill="var(--white)" d="M24 24 L32 40 L40 24 L32 28 Z"></path>
              <path fill="var(--a-red)" d="M32 40 L29 47 L32 70 L35 47 Z"></path>
              <path
                d="M24 24 L30 64 L32 42 M40 24 L34 64 L32 42"
                fill="none"
                stroke="var(--white)"
                strokeWidth="1.5"
              ></path>
              <circle cx="32" cy="80" r="2" fill="var(--white)"></circle>
              <circle cx="32" cy="92" r="2" fill="var(--white)"></circle>
            </svg>
          </div>
        </div>
      );
    case 'book':
      return (
        <div className="book">
          <i className="cv l"></i>
          <i className="cv"></i>
          <i className="pg"></i>
          <i className="pg"></i>
          <i className="pg"></i>
        </div>
      );
    case 'calc':
      return (
        <div className="calc">
          <div className="lcd">
            <span>fx-991CW</span>
          </div>
          <div className="keys">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i}></i>
            ))}
          </div>
        </div>
      );
    case 'shield':
      return (
        <svg className="shield" viewBox="0 0 80 92">
          <path
            className="sh"
            d="M40 4 L74 16 V44 C74 66 58 80 40 86 C22 80 6 66 6 44 V16 Z"
          ></path>
          <path className="ck" d="M24 46 L36 58 L58 34"></path>
        </svg>
      );
    default:
      return (
        <div className="boxd">
          <i className="bx"></i>
          <i className="lb"></i>
        </div>
      );
  }
}

export function CategoriesBoard() {
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>('all');
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/catalog/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && Array.isArray(j?.categories))
          setCounts(
            Object.fromEntries(
              j.categories.map((c: { id: string; count: number }) => [c.id, c.count]),
            ),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="cs">
      <main className="wrap">
        <div className="hd">
          <div>
            <h1>Every category.</h1>
            <p>
              Each note is one shelf. It shows what has to match there before two listings count as
              the same product, and a few real searches to try.
            </p>
          </div>
          <div className="filter" role="group" aria-label="Show">
            {GROUPS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={group === v ? 'on' : ''}
                aria-pressed={group === v}
                onClick={() => setGroup(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="board">
          {C.map((c, i) => (
            <article
              key={c.label}
              className={`note c-${c.c} r${(i % 4) + 1}${group === 'all' || group === c.g ? '' : ' gone'}`}
            >
              <div className="stage" aria-hidden="true">
                <Stage k={c.k} />
              </div>
              <h2>
                <Link prefetch={false} href={`/category/${c.id}`}>
                  {c.label}
                </Link>
              </h2>
              <p>{c.note}</p>
              {counts && c.id in counts && (
                <p className="cnt">
                  {new Intl.NumberFormat('en-IN').format(counts[c.id])} verified product
                  {counts[c.id] === 1 ? '' : 's'}
                  {c.id === 'home-kitchen' ? ' across home and kitchen' : ''}
                </p>
              )}
              <h3>Must match</h3>
              <div className="mm">
                {c.m.map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
              <div className="exs">
                {c.ex.map((q) => (
                  <Link prefetch={false} key={q} href={`/search?q=${encodeURIComponent(q)}`}>
                    {q}
                    <span>search</span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
        <p className="foot">
          Home and Kitchen are shown as separate shelves here; both are stored as the home-kitchen
          category.
        </p>
      </main>
    </div>
  );
}
