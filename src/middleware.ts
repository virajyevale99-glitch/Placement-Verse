import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/auth/session';

// First line of defence: no /admin page renders without a valid signed session.
// Every admin page and the admin API ALSO verify the session server-side.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET);
  if (session) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  }
  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Please sign in.', details: [], retryable: false } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
