'use client';
import { useEffect, useMemo, useState } from 'react';
import { money, type Offer } from '@domain/index';
import { weeklyHistory } from '../../../packages/domain/weekly-history';

const dayName = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(d);
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
  }).format(d);

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
  const days = useMemo(() => weeklyHistory(observations, basis), [observations, basis]);
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
  const prevName = sel > 0 ? dayName(days[sel - 1].date) : '';
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
            const name = dayName(day.date);
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
              {dayName(d.date)}, {fmtDate(d.date)}
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
                    ? 'no previous-day comparison'
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
