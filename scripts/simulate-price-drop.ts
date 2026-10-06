import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { postgres, offers, findProduct } from '../packages/database/postgres';
import { evaluate, type Rule } from '../packages/domain/index';
import { deliverTestAlerts } from '../packages/notifications/test-alerts';
if (process.env.NODE_ENV === 'production' || process.env.VERCEL)
  throw new Error('Run this operator script locally, never in the web deployment.');
try {
  const [email, productId, channel = 'telegram'] = process.argv.slice(2);
  if (!email || !productId || !['telegram', 'email', 'both'].includes(channel))
    throw new Error(
      'Usage: pnpm alerts:test <your verified account email> <product ID> [telegram|email|both]',
    );
  const user = (
    await postgres().query('SELECT * FROM atlas.users WHERE lower(email)=lower($1) AND verified', [
      email,
    ])
  ).rows[0];
  if (!user || user.notifications !== 1) throw new Error('Sign in and enable notifications first.');
  const product = await findProduct(productId),
    real = (await offers(productId)).find((o) => o.itemPrice > 0);
  if (!product || !real) throw new Error('Choose a product with a recorded retailer price.');
  const now = Date.now(),
    target = real.itemPrice,
    simulated = Math.floor(target * 0.95);
  const rule: Rule = {
    id: randomUUID(),
    productId,
    store: 'all',
    target,
    operator: 'lte',
    basis: 'item',
    enabled: true,
    version: 1,
    episode: 0,
    activeEpisode: false,
    aboveCount: 0,
    lastTriggeredAt: null,
    lastEvidence: null,
  };
  const result = evaluate(
    rule,
    [
      {
        ...real,
        id: randomUUID(),
        itemPrice: simulated,
        stock: true,
        condition: 'new',
        accepted: true,
        displayAllowed: true,
        alertsAllowed: true,
        observedAt: now,
        validUntil: now + 60000,
      },
    ],
    now,
  );
  if (!result.trigger) throw new Error('Test rule evaluation did not trigger.');
  const connection = (
    await postgres().query(
      'SELECT * FROM atlas.telegram_connections WHERE user_id=$1 AND enabled',
      [user.id],
    )
  ).rows[0];
  const channels = channel === 'both' ? ['telegram', 'email'] : [channel];
  if (channels.includes('telegram') && !connection)
    throw new Error('Connect Telegram in Settings and press Start first.');
  if (channels.includes('email') && (!user.email_enabled || user.suppressed))
    throw new Error('Enable email alerts for this account first.');
  const ids: string[] = [];
  for (const delivery of channels) {
    const id = randomUUID();
    ids.push(id);
    const message = {
      id,
      eventKey: `operator-test-${id}`,
      userId: user.id,
      email: user.email,
      productId,
      title: product.name,
      price: simulated,
      target,
      store: real.store,
      observedAt: now,
      createdAt: now,
      test: true,
    };
    await postgres().query(
      'INSERT INTO atlas.test_alerts(id,user_id,channel,data,created_at) VALUES($1,$2,$3,$4,$5)',
      [
        id,
        user.id,
        delivery,
        {
          message,
          chatId: connection?.chat_id,
          connectedAt: connection ? Number(connection.connected_at) : null,
        },
        now,
      ],
    );
  }
  await deliverTestAlerts();
  console.log(
    JSON.stringify({
      event: 'simulated_price_drop',
      realPricesUnchanged: true,
      deliveries: (
        await postgres().query(
          'SELECT id,channel,state,provider_id FROM atlas.test_alerts WHERE id=ANY($1::uuid[])',
          [ids],
        )
      ).rows,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Test failed.');
  process.exitCode = 1;
} finally {
  await postgres().end();
}
