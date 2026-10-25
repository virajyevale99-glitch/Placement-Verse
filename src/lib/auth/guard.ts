import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession, type SessionPayload } from './session';
import { findAdminById } from './admins';
import { serverEnv } from '../env';

/** Returns the verified session or null. Never trusts anything the browser says about roles. */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token, serverEnv.sessionSecret);
  if (!session || !findAdminById(session.sub)) return null;
  return session;
}

/** For server components/layouts under /admin. */
export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session;
}

/**
 * CSRF defence for cookie-authenticated POSTs: the session cookie is SameSite=Strict, and we also
 * require the Origin (or Referer) host to match this deployment's host.
 */
export async function isSameOrigin(request: Request): Promise<boolean> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const origin = request.headers.get('origin') || request.headers.get('referer');
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
