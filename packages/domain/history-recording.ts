import type { Offer } from './index';
import { dailyHistory } from './daily-history';
import { historyCoverage } from './history-coverage';

/** Count our own dated observations, never external captures or inferred missing days. */
export function historyRecording(
  observations: Offer[],
  basis: 'item' | 'delivered',
  days = 30,
  now = Date.now(),
) {
  const own = observations.filter((o) => (o.source ?? 'primary') === 'primary');
  const coverage = historyCoverage(own, basis, days, now);
  const daily = dailyHistory(own, basis, days, now);
  const start =
    Math.floor((now + 19800000) / 86400000) * 86400000 - 19800000 - (days - 1) * 86400000;
  const date = (index: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(start + index * 86400000);
  let run = 0,
    longestStreak = 0;
  let streakStart: string | null = null,
    streakEnd: string | null = null;
  daily.forEach((day, index) => {
    run = day.price === null ? 0 : run + 1;
    if (run > 0 && run >= longestStreak) {
      longestStreak = run;
      streakStart = date(index - run + 1);
      streakEnd = date(index);
    }
  });
  return { ...coverage, longestStreak, streakStart, streakEnd };
}
