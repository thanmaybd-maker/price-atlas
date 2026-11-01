// Public HTTPS address used in alert links. Configured origins win; otherwise Vercel's own
// production domain, then the known production URL, so a missing env var on one runner
// (web or worker) can never hold alerts back.
export function publicOrigin() {
  const candidates = [
    process.env.EMAIL_LINK_ORIGIN,
    process.env.APP_ORIGIN,
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    'https://price-atlas-ashen.vercel.app',
  ];
  return candidates
    .find((o) => typeof o === 'string' && o.startsWith('https://'))!
    .replace(/\/$/, '');
}
