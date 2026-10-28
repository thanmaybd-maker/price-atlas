'use client';
import { useEffect, useMemo, useState } from 'react';
import { money, total, type Offer } from '@domain/index';

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const storeName = (s: string) => (s === 'Amazon' ? 'Amazon.in' : s);

type Day = {
  date: Date;
  stores: { store: string; price: number }[];
  low: { store: string; price: number } | null;
  high: { store: string; price: number } | null;
  change: number | null;
};

/**
 * Seven days of recorded prices as seven plastic compartments in a white tray.
 * Only retained, in-stock observations count; a day without checks says so.
 */
export function WeekLedger({
  observations,
  basis = 'delivered',
}: {
  observations: Offer[];
  basis?: 'delivered' | 'item';
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const days = useMemo<Day[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: Day[] = [];
    let prevLow: number | null = null;
    for (let i = 6; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - i);
      const end = start.getTime() + 86400000;
      const best = new Map<string, number>();
      observations
        .filter(
          (o) =>
            o.historyAllowed && o.stock && o.observedAt >= start.getTime() && o.observedAt < end,
        )
        .forEach((o) => {
          const v = total(o, basis);
          if (v === null) return;
          const s = storeName(o.store);
          if (!best.has(s) || v < (best.get(s) as number)) best.set(s, v);
        });
      const stores = [...best.entries()]
        .map(([store, price]) => ({ store, price }))
        .sort((a, b) => a.price - b.price);
      const low = stores[0] || null;
      const high = stores.length ? stores[stores.length - 1] : null;
      const change = low && prevLow !== null ? low.price - prevLow : null;
      if (low) prevLow = low.price;
      out.push({ date: start, stores, low, high, change });
    }
    return out;
  }, [observations, basis]);
  const lastWithData = days
    .map((d, i) => (d.low ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  const [sel, setSel] = useState<number>(lastWithData ?? 6);
  const d = days[sel];
  if (!mounted)
    return (
      <section className="v2-week v2-week-wait" aria-label="Last seven days of recorded prices" />
    );
  const prevName = sel > 0 ? WD[days[sel - 1].date.getDay()] : '';
  const fmtDate = (x: Date) => `${MN[x.getMonth()]} ${x.getDate()}`;
  return (
    <section className="v2-week" aria-label="Last seven days of recorded prices">
      <div className="v2-week-head">
        <h2>This week, day by day.</h2>
        <p>
          Seven compartments, one per day. Green means the lowest recorded price fell that day, red
          means it rose. Hover, tab or tap a day to read its receipt.
        </p>
      </div>
      <div className="v2-week-grid">
        <div className="v2-tray" role="group" aria-label="Days">
          {days.map((day, i) => {
            const tone =
              day.change === null || day.change === 0 ? '' : day.change < 0 ? ' drop' : ' spike';
            const name = WD[day.date.getDay()];
            return (
              <button
                key={i}
                type="button"
                className={`v2-cell wd${i}${tone}${day.low ? '' : ' empty'}${sel === i ? ' on' : ''}`}
                aria-pressed={sel === i}
                aria-label={`${name}, ${fmtDate(day.date)}, ${day.low ? `market low ${money(day.low.price)}` : 'no recorded checks'}`}
                onMouseEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => setSel(i)}
              >
                <span className="l">{name[0]}</span>
                <span className="dt">{fmtDate(day.date)}</span>
                {i === 6 && <i className="now" aria-hidden="true" />}
                <span className="lo">{day.low ? money(day.low.price) : 'no checks'}</span>
                <span className="chg">
                  {day.change === null
                    ? ''
                    : day.change === 0
                      ? 'no change'
                      : `${day.change < 0 ? '−' : '+'}${money(Math.abs(day.change))}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="v2-receipt" aria-live="polite">
          <div className="top">
            <span>Market snapshot</span>
            <span>Price Atlas</span>
          </div>
          <div className="row">
            <span>Date:</span>
            <span>
              {WD[d.date.getDay()]}, {fmtDate(d.date)}
            </span>
          </div>
          {d.low && d.high ? (
            <>
              <div className="row big lo">
                <span>Market low:</span>
                <span>
                  {money(d.low.price)} ({d.low.store})
                </span>
              </div>
              <div className="row big hi">
                <span>Market high:</span>
                <span>
                  {money(d.high.price)} ({d.high.store})
                </span>
              </div>
              <div className="row">
                <span>Change:</span>
                <span>
                  {d.change === null
                    ? 'first recorded day'
                    : d.change === 0
                      ? `none vs ${prevName}`
                      : `${d.change < 0 ? '−' : '+'}${money(Math.abs(d.change))} vs ${prevName}`}
                </span>
              </div>
              <div className="row">
                <span>Stock status:</span>
                <span>
                  Available in {d.stores.length} store{d.stores.length === 1 ? '' : 's'}
                </span>
              </div>
              {d.stores.map((s) => (
                <div className="row sm" key={s.store}>
                  <span>{s.store}</span>
                  <span>{money(s.price)}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="row sm">
              <span>No in-stock checks were recorded this day.</span>
            </div>
          )}
          <div className="stub">
            <span>{basis === 'item' ? 'item prices' : 'delivered prices'}, observed only</span>
          </div>
        </div>
      </div>
    </section>
  );
}
