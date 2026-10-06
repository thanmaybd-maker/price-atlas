import 'dotenv/config';
import { reviewMatch, postgres } from '../packages/database/postgres';
if (process.env.NODE_ENV === 'production' || process.env.VERCEL)
  throw new Error('Run this operator command locally.');
try {
  const [listing, product, ...reason] = process.argv.slice(2);
  if (!listing || !product || reason.join(' ').length < 10)
    throw new Error(
      'Usage: pnpm exec tsx scripts/review-match.ts <listing ID> <canonical product ID> <evidence reason>',
    );
  await reviewMatch(listing, product, 'local-operator', reason.join(' '));
  console.log(JSON.stringify({ matched: true, listing, product, freshCollectionRequired: true }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Review failed.');
  process.exitCode = 1;
} finally {
  await postgres().end();
}
