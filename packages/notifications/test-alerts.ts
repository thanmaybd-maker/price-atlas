import { postgres, tx } from '../database/postgres';
import { ResendNotifications, type AlertMessage, type NotificationProvider } from './index';
import { sendTelegram, type TelegramSender } from './telegram';
import { money } from '../domain/index';
// Operator tests never write rules, price observations or catalog data.
export async function deliverTestAlerts(
  email: NotificationProvider = new ResendNotifications(),
  telegram: TelegramSender = sendTelegram,
) {
  const rows = await tx(async (c) => {
    const due = (
      await c.query(
        "SELECT * FROM atlas.test_alerts WHERE state='pending' ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    for (const r of due)
      await c.query("UPDATE atlas.test_alerts SET state='sending' WHERE id=$1", [r.id]);
    return due;
  });
  for (const r of rows) {
    const user = (await postgres().query('SELECT * FROM atlas.users WHERE id=$1', [r.user_id]))
      .rows[0];
    const connection = (
      await postgres().query('SELECT * FROM atlas.telegram_connections WHERE user_id=$1', [
        r.user_id,
      ])
    ).rows[0];
    if (
      !user?.verified ||
      user.notifications !== 1 ||
      (r.channel === 'email' && (!user.email_enabled || user.suppressed)) ||
      (r.channel === 'telegram' &&
        (!connection?.enabled ||
          connection.chat_id !== r.data.chatId ||
          Number(connection.connected_at) !== r.data.connectedAt))
    ) {
      await postgres().query("UPDATE atlas.test_alerts SET state='suppressed' WHERE id=$1", [r.id]);
      continue;
    }
    try {
      const message = r.data.message as AlertMessage;
      const receipt =
        r.channel === 'email'
          ? (await email.send({ ...message, email: user.email, test: true })).id
          : String(
              await telegram(
                connection.chat_id,
                `TEST ALERT — simulated price drop\n${message.title}\nSimulated item price: ${money(message.price)}\nTest target: ${money(message.target)}\nNo real price, target or history has been changed.\nSend /stop to disconnect alerts.`,
              ),
            );
      await postgres().query(
        "UPDATE atlas.test_alerts SET state='sent',provider_id=$2 WHERE id=$1",
        [r.id, receipt],
      );
    } catch {
      // Provider acceptance may precede a network failure. Never blindly duplicate tests.
      await postgres().query("UPDATE atlas.test_alerts SET state='review' WHERE id=$1", [r.id]);
    }
  }
}
