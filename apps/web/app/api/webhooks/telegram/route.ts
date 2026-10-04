import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  handleTelegramUpdate,
  telegramConfigured,
  telegramSecretValid,
} from '../../../../../../packages/notifications/telegram';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (process.env.APP_MODE !== 'live' || !telegramConfigured())
    return NextResponse.json({ error: 'Telegram is not configured.' }, { status: 503 });
  if (!telegramSecretValid(req.headers.get('x-telegram-bot-api-secret-token')))
    return NextResponse.json({ error: 'Invalid webhook authentication.' }, { status: 401 });
  if (Number(req.headers.get('content-length') || 0) > 16384)
    return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 16384) return new NextResponse(null, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid update.' }, { status: 400 });
  }
  try {
    return NextResponse.json((await handleTelegramUpdate(input)) || { ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ZodError ? 'Invalid update.' : 'Update processing failed.' },
      { status: error instanceof ZodError ? 400 : 503 },
    );
  }
}
