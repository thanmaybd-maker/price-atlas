'use client';
import { useState } from 'react';
import { money, total, type Offer } from '@domain/index';
export function PriceChart({
  observations,
  target,
  compact = false,
  basis = 'delivered',
  demo = true,
  days,
}: {
  observations: Offer[];
  target?: number;
  compact?: boolean;
  basis?: 'delivered' | 'item';
  demo?: boolean;
  /** Selected period; the x-axis spans the whole period even with few checks. */
  days?: number;
}) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<Offer | null>(null);
  const valid = observations.filter((o) => o.historyAllowed && o.stock && total(o, basis) !== null);
  if (!valid.length)
    return (
      <div className="empty-chart">
        No {basis === 'item' ? 'item' : 'delivered'} prices with confirmed stock in this period.
      </div>
    );
  const values = valid.map((o) => total(o, basis)!);
  // Rounded rupee gridlines: step of 1/2/5 x 10^n paise covering the data (and target).
  const lo = Math.min(...values, ...(target ? [target] : []));
  const hi = Math.max(...values, ...(target ? [target] : []));
  const rawStep = Math.max((hi - lo) / 3, hi * 0.01, 100);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= rawStep) || 10 * mag;
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (max === min) {
    min -= step;
    max += step;
  }
  while ((max - min) / step < 3) max += step;
  const gridCount = Math.round((max - min) / step);
  const lastSeen = Math.max(...valid.map((o) => o.observedAt));
  const end = days ? Math.max(Date.now(), lastSeen) : lastSeen;
  const firstSeen = Math.min(...valid.map((o) => o.observedAt));
  const start = days ? Math.min(end - days * 86400000, firstSeen) : firstSeen;
  const single = !days && end - start < 3600000;
  const x = (t: number) => (single ? 374 : 54 + ((t - start) / (end - start || 1)) * 640);
  const y = (v: number) => 190 - ((v - min) / (max - min || 1)) * 155;
  const stores = [...new Set(valid.map((o) => o.store))];
  const colors = ['#8e99b8', '#117855', '#b05b88', '#a56a22', '#6554a4', '#2277a5', '#9a4141'];
  return (
    <div className={compact ? 'chart compact' : 'chart'}>
      <svg
        viewBox="0 0 720 230"
        role="img"
        aria-label={`${demo ? 'Synthetic recorded' : 'Recorded'} ${basis === 'item' ? 'item' : 'delivered'} prices, ranging from ${money(Math.min(...values))} to ${money(Math.max(...values))}. A table is available below.`}
      >
        {!compact &&
          Array.from({ length: gridCount + 1 }, (_, i) => {
            const v = max - i * step;
            return (
              <g key={i}>
                <line x1="54" x2="697" y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".07" />
                <text x="0" y={y(v) + 4} className="axis-label">
                  {money(v)}
                </text>
              </g>
            );
          })}
        {target && (
          <g>
            <line
              x1="54"
              x2="694"
              y1={y(target)}
              y2={y(target)}
              stroke="#9a7629"
              strokeDasharray="4 5"
            />
            <text x="60" y={y(target) - 7} className="axis-label">
              Your target {money(target)}
            </text>
          </g>
        )}
        {stores.map((store, i) => {
          const points = valid.filter((o) => o.store === store);
          return (
            <g key={store}>
              {(() => {
                // Step line: a checked price holds until the next check. Stretches with no
                // check (past the offer's validity) and the carry-forward to today are dashed.
                const solid: string[] = [];
                const dashed: string[] = [];
                points.forEach((o, j) => {
                  const px = x(o.observedAt);
                  const py = y(total(o, basis)!);
                  const next = points[j + 1];
                  const nx = next ? x(next.observedAt) : days ? x(end) : px;
                  if (nx > px) {
                    const seg = `M${px},${py} H${nx}`;
                    if (next && next.observedAt <= o.validUntil + 43200000) solid.push(seg);
                    else dashed.push(seg);
                  }
                  if (next) solid.push(`M${nx},${py} V${y(total(next, basis)!)}`);
                });
                const stroke = colors[i % colors.length];
                const common = {
                  fill: 'none',
                  stroke,
                  strokeWidth: compact ? 4 : 2.5,
                  strokeLinecap: 'round' as const,
                  strokeLinejoin: 'round' as const,
                };
                return (
                  <>
                    {solid.length > 0 && <path d={solid.join(' ')} {...common} />}
                    {dashed.length > 0 && (
                      <path d={dashed.join(' ')} {...common} strokeDasharray="3 6" opacity=".75" />
                    )}
                  </>
                );
              })()}
              {!compact &&
                points.map((o) => (
                  <circle
                    key={o.id}
                    cx={x(o.observedAt)}
                    cy={y(total(o, basis)!)}
                    r="5"
                    fill="var(--surface, #fff)"
                    stroke={colors[i % colors.length]}
                    strokeWidth="2.5"
                    onMouseEnter={() => setHover(o)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>
                      {`${o.store}: ${money(total(o, basis))} · ${new Date(o.observedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`}
                    </title>
                  </circle>
                ))}
            </g>
          );
        })}
        {!compact &&
          (single ? [0.5] : [0, 0.25, 0.5, 0.75, 1]).map((f, i, all) => (
            <text
              key={f}
              x={single ? 374 : 54 + f * 640}
              y="220"
              textAnchor={all.length > 1 && i === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
              className="axis-label"
            >
              {new Date(start + (end - start) * f).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                timeZone: 'Asia/Kolkata',
              })}
            </text>
          ))}
      </svg>
      {!compact && (
        <>
          <div className="chart-legend">
            {stores.map((store, i) => (
              <span key={store}>
                <i className="legend-dot" style={{ background: colors[i % colors.length] }} />
                {store}
              </span>
            ))}
            <span className="chart-hover">
              {hover
                ? `${hover.store} · ${money(total(hover, basis))}`
                : `${valid.length} ${demo ? 'synthetic checks' : 'recorded checks'} · dashed = no check that day, last checked price held`}
            </span>
            <button className="text-button" onClick={() => setTable(!table)}>
              {table ? 'Hide' : 'View'} data table
            </button>
          </div>
          {table && (
            <div className="table-scroll history-table">
              <table>
                <thead>
                  <tr>
                    <th>Observed</th>
                    <th>Source</th>
                    <th>{basis === 'item' ? 'Item price' : 'Delivered total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {valid
                    .slice()
                    .reverse()
                    .map((o) => (
                      <tr key={o.id}>
                        <td>
                          {new Date(o.observedAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                          })}
                        </td>
                        <td>{o.store}</td>
                        <td>{money(total(o, basis))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
