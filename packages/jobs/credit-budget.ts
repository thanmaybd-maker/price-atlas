// Direct page and discovery checks share this request cap, including zero-credit checks.
// Paid provider credits remain independently capped below.
export const MAX_TOTAL_REQUESTS_PER_DAY = 3000;
// Daily burst allowance; the monthly cap remains shared across all configured keys.
export const MAX_PAID_CREDITS_PER_DAY = 200;
export const MAX_PAID_CREDITS_PER_MONTH = 3600;
export const MAX_PAID_CREDITS_PER_REQUEST = 10;
export function boundedLimit(value: string | undefined, maximum: number) {
  const configured = value === undefined ? maximum : Number(value);
  if (!Number.isSafeInteger(configured) || configured < 0)
    throw new Error('Invalid collection limit');
  return Math.min(configured, maximum);
}
