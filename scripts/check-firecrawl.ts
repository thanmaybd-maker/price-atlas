import 'dotenv/config';
import { providerCredentials } from '../packages/jobs/provider-pool';
const keys = providerCredentials(process.env.FIRECRAWL_API_KEY, 'firecrawl');
if (!keys.length) throw new Error('Configure Firecrawl in the private environment first.');
let failures = 0;
for (const [index, key] of keys.entries()) {
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    const body = await response.json();
    const valid = response.ok && body.success === true;
    if (!valid) failures++;
    console.log(
      JSON.stringify({
        slot: index === 0 ? 'primary' : `backup ${index}`,
        authenticated: valid,
        status: response.status,
        remainingCredits: valid ? body.data?.remainingCredits : null,
      }),
    );
  } catch {
    failures++;
    console.log(
      JSON.stringify({
        slot: index === 0 ? 'primary' : `backup ${index}`,
        authenticated: false,
        status: 'unreachable',
      }),
    );
  }
}
process.exitCode = failures ? 1 : 0;
