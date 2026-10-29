'use client';
// "Thirty days, drawn as tides." from the design canvas: one ridge per product (home) or per store
// (product page), lowest recorded price per day, with gaps where nothing was observed.
import { useState } from 'react';
import type { Offer } from '@domain/index';
import { dailyLows } from '../../../packages/domain/daily-history';

type Basis = 'delivered' | 'item';
const fmt = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(paise / 100);

// ---------------------------------------------------------------------------
// Thirty days, drawn as tides. Used on the home page (one ridge per product)
// and on product pages (one ridge per store).
// ---------------------------------------------------------------------------
export type Ridge = { key: string; name: string; obs: Offer[] };
export function TidesWorld({
  ridges,
  title = 'Recorded history · last 30 days.',
  lede = 'Each wave is one watched product, recorded prices only, and a gap means nothing was observed. Drag across to read any day; pick a name to follow it.',
  basis = 'delivered',
  embedded = false,
}: {
  ridges: Ridge[];
  title?: string;
  lede?: string;
  basis?: Basis;
  embedded?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [scrub, setScrub] = useState(-1);
  const N = 30;
  const geom = ridges.slice(0, 4).map((r, i) => {
    const s = dailyLows(r.obs, basis, N);
    const vals = s.filter((v): v is number => v != null);
    const mn = vals.length ? Math.min(...vals) : 0;
    const mx = vals.length ? Math.max(...vals) : 0;
    const top = 34 + i * 104;
    const amp = 78;
    const X = (j: number) => 230 + (j / (N - 1)) * 930;
    const Y = (v: number) => top + amp - ((v - mn) / (mx - mn || 1)) * amp * (mx === mn ? 0.5 : 1);
    let line = '';
    let area = '';
    let run: number[] = [];
    const flush = () => {
      if (!run.length) return;
      const base = top + amp + 14;
      const pts = run.map((j) => `${X(j).toFixed(1)} ${Y(s[j] as number).toFixed(1)}`);
      line += 'M' + pts.join(' L') + ' ';
      area += `M${X(run[0]).toFixed(1)} ${base} L${pts.join(' L')} L${X(run[run.length - 1]).toFixed(1)} ${base} Z `;
      run = [];
    };
    s.forEach((v, j) => {
      if (v == null) flush();
      else run.push(j);
    });
    flush();
    const li = vals.length ? s.indexOf(mn) : -1;
    return { r, s, mn, mx, top, amp, X, Y, line, area, li, has: vals.length > 0 };
  });
  const on = Math.min(active, Math.max(0, geom.length - 1));
  const h = Math.max(140, 34 + geom.length * 104 + 10);
  return (
    <section className={embedded ? 'al al-embed' : 'al'}>
      <div className="wrap">
        <div className="al-head rv">
          <h2>{title}</h2>
          <p>{lede}</p>
        </div>
        <div className="al-sheet rv">
          <div className="al-pick" role="group" aria-label="Follow a line">
            {geom.map((g, i) => (
              <button
                key={g.r.key}
                type="button"
                className={i === on ? 'on' : ''}
                aria-pressed={i === on}
                onClick={() => setActive(i)}
              >
                <i className={'c' + i}></i>
                {g.r.name}
              </button>
            ))}
          </div>
          {!geom.length ? (
            <p className="al-empty">
              Save a product or search one: its recorded prices start drawing here after the first
              checks.
            </p>
          ) : (
            <svg
              className="ridge"
              viewBox={`0 0 1180 ${h}`}
              role="img"
              aria-label={`Thirty-day lowest recorded prices for ${geom.map((g) => g.r.name).join(', ')}`}
              onPointerMove={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - b.left) / b.width) * 1180;
                const d = Math.round(((x - 230) / 930) * (N - 1));
                setScrub(d < 0 || d > N - 1 ? -1 : d);
              }}
              onPointerLeave={() => setScrub(-1)}
            >
              <defs>
                {geom.map((g, i) => (
                  <linearGradient key={g.r.key} id={'tide-' + i} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className={'t' + i} stopOpacity="0.75"></stop>
                    <stop offset="100%" className={'t' + i} stopOpacity="0.05"></stop>
                  </linearGradient>
                ))}
              </defs>
              {geom.map((g, i) => (
                <g key={g.r.key}>
                  <path
                    className={'ra' + (i === on ? '' : ' off')}
                    d={g.area}
                    fill={`url(#tide-${i})`}
                  ></path>
                  <path className={`rl l${i}${i === on ? ' on' : ' off'}`} d={g.line}></path>
                  {g.s.map((value, day) =>
                    value === null ? null : (
                      <circle
                        key={day}
                        className="recorded-point"
                        cx={g.X(day).toFixed(1)}
                        cy={g.Y(value).toFixed(1)}
                        r="3.5"
                        fill="var(--al-ink)"
                      >
                        <title>
                          {`${g.r.name}: ₹${fmt(value)} · ${day === N - 1 ? 'today' : `${N - 1 - day} days ago`}`}
                        </title>
                      </circle>
                    ),
                  )}
                  <text x="0" y={g.top + 34}>
                    {g.r.name.length > 26 ? g.r.name.slice(0, 25) + '…' : g.r.name}
                  </text>
                  <text className="fig" x="0" y={g.top + 54}>
                    {g.has ? `₹${fmt(g.mn)} to ₹${fmt(g.mx)}` : 'not observed yet'}
                  </text>
                  {g.li >= 0 && (
                    <circle
                      className="low"
                      cx={g.X(g.li).toFixed(1)}
                      cy={g.Y(g.mn).toFixed(1)}
                      r="5.5"
                    ></circle>
                  )}
                </g>
              ))}
              {scrub >= 0 && (
                <g>
                  <line
                    className="scrub"
                    x1={geom[0].X(scrub)}
                    x2={geom[0].X(scrub)}
                    y1="20"
                    y2={h - 20}
                  ></line>
                  <text className="sday" x={geom[0].X(scrub)} y={h - 4} textAnchor="middle">
                    {scrub === N - 1 ? 'today' : `${N - 1 - scrub} days ago`}
                  </text>
                  {geom.map((g) => {
                    const v = g.s[scrub];
                    const x = g.X(scrub);
                    const y = v == null ? g.top + g.amp / 2 : g.Y(v);
                    return (
                      <g key={g.r.key}>
                        <circle className="sd" cx={x.toFixed(1)} cy={y.toFixed(1)} r="5"></circle>
                        <text
                          className="sv"
                          x={(x + (scrub > 24 ? -110 : 10)).toFixed(1)}
                          y={(y - 10).toFixed(1)}
                        >
                          {v == null ? 'not observed' : '₹' + fmt(v)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          )}
          <div className="al-key">
            <span>
              magenta dot <b>lowest day</b>
            </span>
            <span>
              small dot <b>recorded day</b>
            </span>
            <span>
              display freshness <b>24 h</b>
            </span>
            <span>
              alert freshness <b>1 h</b>
            </span>
            <span>
              history window <b>up to 30 d</b>
            </span>
          </div>
          <details className="tide-data">
            <summary>View recorded daily prices</summary>
            <p>
              {basis === 'item'
                ? 'Item prices; shipping is excluded.'
                : 'Only totals with known shipping.'}{' '}
              Missing days have no recorded check.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Product / store</th>
                  <th>India date</th>
                  <th>Lowest recorded price</th>
                </tr>
              </thead>
              <tbody>
                {geom.flatMap((g) =>
                  g.s.flatMap((value, index) =>
                    value === null ? (
                      []
                    ) : (
                      <tr key={`${g.r.key}:${index}`}>
                        <td>{g.r.name}</td>
                        <td>
                          {new Intl.DateTimeFormat('en-CA', {
                            timeZone: 'Asia/Kolkata',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          }).format(Date.now() - (N - 1 - index) * 86400000)}
                        </td>
                        <td>₹{fmt(value)}</td>
                      </tr>
                    ),
                  ),
                )}
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </section>
  );
}
