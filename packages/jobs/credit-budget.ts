export const MAX_TOTAL_REQUESTS_PER_DAY = 1000;
// Four Firecrawl accounts with 1,000 credits each per billing month: about 130 a day.
// Caps stay below that so a runaway loop cannot drain the accounts before month end.
export const MAX_PAID_CREDITS_PER_DAY = 130;
export const MAX_PAID_CREDITS_PER_MONTH = 3600;
export const MAX_PAID_CREDITS_PER_REQUEST = 10;
export function boundedLimit(value: string | undefined, maximum: number) {
  const configured = value === undefined ? maximum : Number(value);
  if (!Number.isSafeInteger(configured) || configured < 0)
    throw new Error('Invalid collection limit');
  return Math.min(configured, maximum);
}
