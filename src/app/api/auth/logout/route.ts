import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/guard';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await isSameOrigin(req))) return NextResponse.json({ ok: false }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
