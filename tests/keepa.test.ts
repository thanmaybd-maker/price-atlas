import { describe, expect, it } from 'vitest';
import {
  dailyFromSeries,
  keepaObservations,
  keepaSeries,
  unitScale,
} from '../packages/providers/keepa';

const DAY = 86400000;
const IST = 19800000;
const keepaTime = (ms: number) => ms / 60000 - 21564000;
// Noon IST on 31 Oct 2026
const now = Date.UTC(2026, 9, 31, 6, 30);
const dayStart = (offset: number) => Math.floor((now + IST) / DAY) * DAY - IST + offset * DAY;

describe('keepa', () => {
  it('parses [time, price] pairs and keeps -1 as unavailable', () => {
    const s = keepaSeries([keepaTime(dayStart(-3)), 7699000, keepaTime(dayStart(-2)), -1]);
    expect(s).toEqual([
      { at: dayStart(-3), paise: 7699000 },
      { at: dayStart(-2), paise: null },
    ]);
  });
  it('uses dated change points only, preserving gaps and the actual minimum timestamp', () => {
    const points = [
      { at: dayStart(-5) + 3600000, paise: 50000 },
      { at: dayStart(-3) + 3600000, paise: 45000 },
      { at: dayStart(-3) + 7200000, paise: 47000 },
      { at: dayStart(-2) + 3600000, paise: null },
    ];
    const d = dailyFromSeries(points, 6, now);
    expect(d.map((x) => [Math.round((x.day - dayStart(0)) / DAY), x.paise])).toEqual([
      [-5, 50000],
      [-3, 45000],
    ]);
    expect(d[1].observedAt).toBe(dayStart(-3) + 3600000);
  });
  it('anchors the unit to the live price and refuses a mismatch', () => {
    expect(unitScale(7699000, 7699000)).toBe(1);
    expect(unitScale(76990, 7699000)).toBe(100);
    expect(unitScale(1000, 7699000)).toBeNull();
    expect(unitScale(null, 7699000)).toBeNull();
  });
  it('does not backfill an old change across the window or admit future and unavailable points', () => {
    expect(
      dailyFromSeries(
        [
          { at: dayStart(-10), paise: 100 },
          { at: dayStart(-2), paise: null },
          { at: dayStart(1), paise: 200 },
          { at: dayStart(-1), paise: -10 },
        ],
        7,
        now,
      ),
    ).toEqual([]);
  });
  it('writes history-only rows that can never become a live offer or alert', () => {
    const [row] = keepaObservations({ id: 'amazon-x', productId: 'p', url: 'u' }, [
      { day: dayStart(-1), paise: 100, observedAt: dayStart(-1) + 3600000 },
    ]);
    expect(row.offer).toMatchObject({
      historyAllowed: true,
      displayAllowed: false,
      alertsAllowed: false,
      source: 'keepa',
      store: 'Amazon',
    });
    expect(row.observedAt).toBe(dayStart(-1) + 3600000);
  });
});
