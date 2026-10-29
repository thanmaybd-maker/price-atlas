import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { knownPagePath } from '../../packages/domain/routes';
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith('/api/') && !knownPagePath(path))
    return new NextResponse(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Price Atlas</title><main style="padding:3rem;font-family:system-ui"><h1>This page wandered off.</h1><p>The address does not match a Price Atlas page.</p><a href="/">Back to Price Atlas</a></main></html>',
      {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  let response = NextResponse.next({ request });
  if (
    process.env.APP_MODE !== 'live' ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY
  )
    return response;
  const client = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|vendor/|models/).*)'],
};
