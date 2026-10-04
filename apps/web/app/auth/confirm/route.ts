import { NextRequest, NextResponse } from 'next/server';
import { authClient, safeReturn } from '@/lib/auth';
import type { EmailOtpType } from '@supabase/supabase-js';
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get('token_hash');
  const type = req.nextUrl.searchParams.get('type');
  if (
    hash &&
    type &&
    ['email', 'signup', 'magiclink', 'recovery', 'invite', 'email_change'].includes(type)
  ) {
    const { error } = await (
      await authClient()
    ).auth.verifyOtp({ token_hash: hash, type: type as EmailOtpType });
    if (!error)
      return NextResponse.redirect(
        new URL(safeReturn(req.nextUrl.searchParams.get('next')), req.nextUrl.origin),
      );
  }
  return NextResponse.redirect(new URL('/auth/login?error=expired', req.nextUrl.origin));
}
