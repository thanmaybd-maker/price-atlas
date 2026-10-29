import { createHash } from 'node:crypto';
import { postgres } from '../database/postgres';
import { ScrapeError } from '../providers/scraper';

type CredentialProvider = 'scrapingbee' | 'firecrawl';
export function providerCredentials(
  primary?: string,
  provider: CredentialProvider = 'scrapingbee',
) {
  // Secrets stay in environment settings. Only irreversible fingerprints are
  // persisted so web instances share exhausted-account and cooldown state.
  return [
    ...new Set(
      [
        primary,
        ...(
          process.env[
            provider === 'firecrawl'
              ? 'FIRECRAWL_FALLBACK_API_KEYS'
              : 'SCRAPINGBEE_FALLBACK_API_KEYS'
          ] || ''
        ).split(/[\s,]+/),
      ]
        .map((v) => v?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ].slice(0, 10);
}
export const scrapingBeeCredentials = (primary?: string) => providerCredentials(primary);
export const credentialFingerprint = (key: string) =>
  createHash('sha256').update(key).digest('hex');
export async function availableCredentials(
  primary?: string,
  provider: CredentialProvider = 'scrapingbee',
) {
  const keys = providerCredentials(primary, provider);
  if (!keys.length)
    throw new ScrapeError('configuration', 'Collection provider credentials are missing.');
  const states = (
    await postgres().query(
      `SELECT fingerprint,disabled,retry_after FROM atlas.provider_keys WHERE fingerprint IN (${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
      keys.map(credentialFingerprint),
    )
  ).rows;
  const cursor = (
    await postgres().query('SELECT fingerprint FROM atlas.provider_cursor WHERE id=$1', [provider])
  ).rows[0]?.fingerprint;
  const start = Math.max(
    0,
    keys.findIndex((key) => credentialFingerprint(key) === cursor),
  );
  const ordered = [...keys.slice(start), ...keys.slice(0, start)];
  return ordered.filter((key) => {
    const state = states.find((s) => s.fingerprint === credentialFingerprint(key));
    return !state || (!state.disabled && Number(state.retry_after) <= Date.now());
  });
}
export async function recordCredentialSuccess(
  key: string,
  provider: CredentialProvider = 'scrapingbee',
) {
  await postgres().query(
    'INSERT INTO atlas.provider_cursor(id,fingerprint,updated_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,updated_at=excluded.updated_at',
    [provider, credentialFingerprint(key), Date.now()],
  );
}
export async function recordCredentialFailure(
  key: string,
  code: string,
  provider: CredentialProvider = 'scrapingbee',
) {
  const disabled =
    code === 'provider_auth' || (code === 'provider_credits' && provider === 'scrapingbee');
  const cooldown = provider === 'firecrawl' && code === 'provider_credits' ? 6 * 3600000 : 60000;
  await postgres().query(
    'INSERT INTO atlas.provider_keys(fingerprint,disabled,retry_after,last_error,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fingerprint) DO UPDATE SET disabled=excluded.disabled,retry_after=excluded.retry_after,last_error=excluded.last_error,updated_at=excluded.updated_at',
    [credentialFingerprint(key), disabled, disabled ? 0 : Date.now() + cooldown, code, Date.now()],
  );
}
