import { createHmac, timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';
import { money } from '../domain/index';
export type AlertMessage = {
  id: string;
  eventKey: string;
  userId: string;
  email: string;
  productId: string;
  title: string;
  price: number;
  target: number;
  store: string;
  observedAt: number;
  createdAt: number;
  test?: boolean;
};
export function unsubscribeToken(userId: string, expires: number) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('UNSUBSCRIBE_SECRET must contain at least 32 characters.');
  const payload = `${userId}.${expires}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
export function verifyUnsubscribe(token: string, now = Date.now()) {
  const [id, expiry, signature] = token.split('.');
  if (
    !id ||
    !/^[-a-f0-9]{36}$/i.test(id) ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) < now ||
    !signature
  )
    return null;
  try {
    const expected = unsubscribeToken(id, Number(expiry)).split('.')[2];
    return /^[a-f0-9]{64}$/.test(signature) &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
      ? id
      : null;
  } catch {
    return null;
  }
}
export function alertText(message: AlertMessage) {
  const origin = process.env.EMAIL_LINK_ORIGIN || process.env.APP_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:')
    throw new Error('Email links need an HTTPS APP_ORIGIN.');
  const unsubscribe = `${origin}/unsubscribe?token=${unsubscribeToken(message.userId, message.createdAt + 90 * 86400000)}`;
  return `${message.title}\n\n${message.store}: ${money(message.price)}\nYour target: ${money(message.target)}\nObserved: ${new Date(message.observedAt).toISOString()}\n\nReview the exact product and delivery context: ${origin}/p/${encodeURIComponent(message.productId)}\nPrices and stock can change at the retailer.\n\nStop email alerts: ${unsubscribe}`;
}
export interface NotificationProvider {
  send(message: AlertMessage): Promise<{ id: string }>;
}
export class ResendNotifications implements NotificationProvider {
  async send(message: AlertMessage) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
      throw new Error('Configure RESEND_API_KEY and a verified EMAIL_FROM sender.');
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.EMAIL_FROM,
        to: message.email,
        subject: message.test
          ? 'TEST ALERT — simulated Price Atlas drop'
          : 'Your Price Atlas target is here',
        text:
          (message.test
            ? 'TEST ALERT — simulated price drop. No real price, target or history has been changed.\n\n'
            : '') + alertText(message),
      },
      { idempotencyKey: `atlas/${message.eventKey}` },
    );
    if (error || !data) throw new Error('Email provider rejected or could not confirm delivery.');
    return { id: data.id };
  }
}
