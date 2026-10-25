import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation/schemas';
import { findAdminByUsername } from '@/lib/auth/admins';
import { verifyAdminPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/guard';
import { serverEnv } from '@/lib/env';
import { callBackend } from '@/lib/backend/client';
import { checkLocalThrottle, recordLocalThrottle } from '@/lib/auth/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message, details: [], retryable: false } }, { status });
}

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

async function throttleBlocked(keys: string[]): Promise<boolean> {
  if (keys.some((k) => checkLocalThrottle(k))) return true;
  try {
    const results = await Promise.all(keys.map((key) => callBackend<{ blocked: boolean }>('auth.throttleCheck', { key })));
    return results.some((r) => r.blocked);
  } catch {
    return false; // backend down: per-instance limiter above still applies
  }
}

async function recordAttempt(keys: string[], success: boolean) {
  keys.forEach((k) => recordLocalThrottle(k, success));
  await Promise.all(keys.map((key) => callBackend('auth.throttleRecord', { key, success }).catch(() => undefined)));
}

export async function POST(req: Request) {
  if (serverEnv.demoMode) return fail(503, 'DEMO_MODE', 'Admin is disabled in local demo mode. Configure Google Apps Script first (docs/SETUP.md).');
  if (!(await isSameOrigin(req))) return fail(403, 'FORBIDDEN', 'Cross-site request blocked.');
  if (serverEnv.sessionSecret.length < 32) return fail(500, 'MISCONFIGURED', 'ADMIN_SESSION_SECRET is not configured.');

  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, 'VALIDATION', 'Enter your username and password.');
  const { username, password } = parsed.data;

  const admin = findAdminByUsername(username);
  const keys = [`login:${admin ? admin.id : 'unknown'}`, `login-ip:${clientIp(req)}`];
  if (await throttleBlocked(keys)) return fail(429, 'THROTTLED', 'Too many failed attempts. Try again in 15 minutes.');

  const valid = verifyAdminPassword(password);
  if (!admin || !valid) {
    await recordAttempt(keys, false);
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
    return fail(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
  }

  // The spreadsheet's Admins tab can disable an admin without a redeploy.
  try {
    const status = await callBackend<{ enabled: boolean; display_name?: string }>('auth.admin', { admin_id: admin.id });
    if (!status.enabled) return fail(403, 'FORBIDDEN', 'This administrator account is disabled.');
  } catch {
    return fail(503, 'BACKEND_UNAVAILABLE', 'Could not verify your account right now. Please retry.');
  }

  await recordAttempt(keys, true);
  const token = await signSession({ sub: admin.id, name: admin.displayName }, serverEnv.sessionSecret);
  const res = NextResponse.json({ ok: true, data: { name: admin.displayName } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
