import 'dotenv/config';
import {
  scrapingBeeCredentials,
  credentialFingerprint,
  recordCredentialFailure,
} from '../packages/jobs/provider-pool';
import { postgres } from '../packages/database/postgres';
const keys = scrapingBeeCredentials(process.env.SCRAPINGBEE_API_KEY);
try {
  for (const [i, key] of keys.entries()) {
    try {
      const r = await fetch('https://app.scrapingbee.com/api/v1/usage', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        if ([401, 402].includes(r.status))
          await recordCredentialFailure(
            key,
            r.status === 401 ? 'provider_auth' : 'provider_credits',
          );
        console.log(JSON.stringify({ account: i + 1, status: r.status }));
        continue;
      }
      const d = await r.json();
      const remaining = Number(d.max_api_credit) - Number(d.used_api_credit);
      if (!Number.isFinite(remaining)) throw new Error('Invalid usage response');
      if (remaining > 0)
        await postgres().query('DELETE FROM atlas.provider_keys WHERE fingerprint=$1', [
          credentialFingerprint(key),
        ]);
      else await recordCredentialFailure(key, 'provider_credits');
      console.log(
        JSON.stringify({
          account: i + 1,
          status: remaining > 0 ? 'available' : 'exhausted',
          remainingCredits: remaining,
        }),
      );
    } catch {
      console.log(JSON.stringify({ account: i + 1, status: 'unreachable' }));
    }
  }
} finally {
  await postgres().end();
}
