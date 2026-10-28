import { createHash } from 'node:crypto';
import { postgres } from '../database/postgres';
import { ScrapeError } from '../providers/scraper';

export function scrapingBeeCredentials(primary?: string) {
  // Secrets stay in environment settings. Only irreversible fingerprints are
  // persisted so web instances share exhausted-account and cooldown state.
  return [
    ...new Set(
      [primary, ...(process.env.SCRAPINGBEE_FALLBACK_API_KEYS || '').split(/[\s,]+/)]
        .map((v) => v?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ].slice(0, 10);
}
export const credentialFingerprint = (key: string) =>
  createHash('sha256').update(key).digest('hex');
export async function availableCredentials(primary?: string) {
  const keys = scrapingBeeCredentials(primary);
  if (!keys.length) throw new ScrapeError('configuration', 'ScrapingBee credentials are missing.');
  const states = (
    await postgres().query(
      `SELECT fingerprint,disabled,retry_after FROM atlas.provider_keys WHERE fingerprint IN (${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
      keys.map(credentialFingerprint),
    )
  ).rows;
  return keys.filter((key) => {
    const state = states.find((s) => s.fingerprint === credentialFingerprint(key));
    return !state || (!state.disabled && Number(state.retry_after) <= Date.now());
  });
}
export async function recordCredentialFailure(key: string, code: string) {
  const disabled = ['provider_credits', 'provider_auth'].includes(code);
  await postgres().query(
    'INSERT INTO atlas.provider_keys(fingerprint,disabled,retry_after,last_error,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fingerprint) DO UPDATE SET disabled=excluded.disabled,retry_after=excluded.retry_after,last_error=excluded.last_error,updated_at=excluded.updated_at',
    [credentialFingerprint(key), disabled, disabled ? 0 : Date.now() + 60000, code, Date.now()],
  );
}
