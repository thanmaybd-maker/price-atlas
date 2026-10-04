import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { tx } from '@database/postgres';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (
    process.env.APP_MODE !== 'live' ||
    !process.env.RESEND_WEBHOOK_SECRET ||
    !process.env.RESEND_API_KEY
  )
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  if (Number(req.headers.get('content-length') || 0) > 65536)
    return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 65536) return new NextResponse(null, { status: 413 });
  try {
    const id = req.headers.get('svix-id') || '';
    const event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload: raw,
      headers: {
        id,
        timestamp: req.headers.get('svix-timestamp') || '',
        signature: req.headers.get('svix-signature') || '',
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
    await tx(async (c) => {
      const inserted = await c.query(
        'INSERT INTO atlas.webhook_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, event.type, Date.now()],
      );
      if (!inserted.rowCount) return;
      if (!event.type.startsWith('email.') || !('email_id' in event.data)) return;
      const emailId = event.data.email_id;
      if (['email.bounced', 'email.complained', 'email.suppressed'].includes(event.type)) {
        await c.query(
          'UPDATE atlas.users SET suppressed=true,email_enabled=false WHERE id IN (SELECT user_id FROM atlas.notifications WHERE provider_id=$1)',
          [emailId],
        );
        await c.query(
          "UPDATE atlas.notifications SET email_state='suppressed' WHERE user_id IN (SELECT user_id FROM atlas.notifications WHERE provider_id=$1) AND email_state IN ('pending','sending')",
          [emailId],
        );
      }
      const state =
        event.type === 'email.delivered'
          ? 'delivered'
          : event.type === 'email.bounced'
            ? 'bounced'
            : event.type === 'email.complained'
              ? 'complained'
              : event.type === 'email.failed'
                ? 'failed'
                : null;
      if (state)
        await c.query(
          "UPDATE atlas.notifications SET email_state=$2 WHERE provider_id=$1 AND email_state NOT IN ('bounced','complained')",
          [emailId, state],
        );
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook or processing failure.' }, { status: 400 });
  }
}
