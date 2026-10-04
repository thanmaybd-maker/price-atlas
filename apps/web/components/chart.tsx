'use client';
import { useState } from 'react';
import { money, total, type Offer } from '@domain/index';
export function PriceChart({
  observations,
  target,
  compact = false,
}: {
  observations: Offer[];
  target?: number;
  compact?: boolean;
}) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<Offer | null>(null);
  const valid = observations.filter((o) => o.historyAllowed && o.stock && total(o) !== null);
  if (!valid.length) return <div className="empty-chart">No recorded checks in this period.</div>;
  const values = valid.map((o) => total(o)!);
  const min = Math.min(...values, ...(target ? [target] : [])) * 0.97;
  const max = Math.max(...values) * 1.02;
  const start = Math.min(...valid.map((o) => o.observedAt));
  const end = Math.max(...valid.map((o) => o.observedAt));
  const x = (t: number) => 54 + ((t - start) / (end - start || 1)) * 640;
  const y = (v: number) => 190 - ((v - min) / (max - min || 1)) * 155;
  const stores = ['Amazon', 'Flipkart'];
  return (
    <div className={compact ? 'chart compact' : 'chart'}>
      <svg
        viewBox="0 0 720 230"
        role="img"
        aria-label={`Synthetic recorded delivered prices, ranging from ${money(Math.min(...values))} to ${money(Math.max(...values))}. A table is available below.`}
      >
        {!compact &&
          [0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line
                x1="54"
                x2="697"
                y1={35 + i * 51}
                y2={35 + i * 51}
                stroke="currentColor"
                opacity=".07"
              />
              <text x="0" y={39 + i * 51} className="axis-label">
                {money(max - ((max - min) * i) / 3)}
              </text>
            </g>
          ))}
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
              <path
                d={points
                  .map(
                    (o, j) =>
                      `${j && o.observedAt <= points[j - 1].validUntil ? 'L' : 'M'}${x(o.observedAt)},${y(total(o)!)}`,
                  )
                  .join(' ')}
                fill="none"
                stroke={i ? '#117855' : '#8e99b8'}
                strokeWidth={compact ? 4 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={i ? undefined : '5 4'}
              />
              {!compact &&
                points.map((o) => (
                  <circle
                    key={o.id}
                    cx={x(o.observedAt)}
                    cy={y(total(o)!)}
                    r="5"
                    fill={i ? '#117855' : '#8e99b8'}
                    fillOpacity=".1"
                    onMouseEnter={() => setHover(o)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>
                      {o.store}: {money(total(o))} ·{' '}
                      {new Date(o.observedAt).toLocaleString('en-IN')}
                    </title>
                  </circle>
                ))}
            </g>
          );
        })}
        {!compact &&
          [0, 1, 2, 3, 4].map((i) => (
            <text
              key={i}
              x={54 + i * 160}
              y="220"
              textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
              className="axis-label"
            >
              {new Date(start + ((end - start) * i) / 4).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
            </text>
          ))}
      </svg>
      {!compact && (
        <>
          <div className="chart-legend">
            <span>
              <i className="legend-dot amazon" />
              Amazon
            </span>
            <span>
              <i className="legend-dot" />
              Flipkart
            </span>
            <span className="chart-hover">
              {hover
                ? `${hover.store} · ${money(total(hover))}`
                : `${valid.length} synthetic checks · source default location`}
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
                    <th>Delivered total</th>
                  </tr>
                </thead>
                <tbody>
                  {valid
                    .slice()
                    .reverse()
                    .map((o) => (
                      <tr key={o.id}>
                        <td>{new Date(o.observedAt).toLocaleString('en-IN')}</td>
                        <td>{o.store}</td>
                        <td>{money(total(o))}</td>
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
