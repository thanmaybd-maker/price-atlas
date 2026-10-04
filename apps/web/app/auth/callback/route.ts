import { NextRequest, NextResponse } from 'next/server';
import { authClient, safeReturn } from '@/lib/auth';
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeReturn(req.nextUrl.searchParams.get('next')), req.nextUrl.origin),
      );
  }
  return NextResponse.redirect(new URL('/auth/login?error=expired', req.nextUrl.origin));
}
