export const MAX_TOTAL_REQUESTS_PER_DAY = 1000;
export const MAX_PAID_CREDITS_PER_DAY = 100;
export const MAX_PAID_CREDITS_PER_MONTH = 300;
export const MAX_PAID_CREDITS_PER_REQUEST = 10;
export function boundedLimit(value: string | undefined, maximum: number) {
  const configured = value === undefined ? maximum : Number(value);
  if (!Number.isSafeInteger(configured) || configured < 0)
    throw new Error('Invalid collection limit');
  return Math.min(configured, maximum);
}
