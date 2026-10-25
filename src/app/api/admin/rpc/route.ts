import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { ADMIN_RPC, MUTATING_OPS, zodDetails, type AdminOp } from '@/lib/validation/schemas';
import { getSession, isSameOrigin } from '@/lib/auth/guard';
import { BackendCallError, callBackend } from '@/lib/backend/client';
import { PUBLIC_DATA_TAG } from '@/lib/backend/public';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string, message: string, details: unknown[] = [], retryable = false) {
  return NextResponse.json({ ok: false, error: { code, message, details, retryable } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Single admin entry point. Order of checks:
 *  1. same-origin (CSRF)  2. signed session  3. op allowlist  4. zod validation
 *  5. Apps Script re-checks the admin is enabled and re-validates everything under a lock.
 */
export async function POST(req: Request) {
  if (serverEnv.demoMode) return err(503, 'DEMO_MODE', 'Admin is disabled in local demo mode.');
  if (!(await isSameOrigin(req))) return err(403, 'FORBIDDEN', 'Cross-site request blocked.');
  const session = await getSession();
  if (!session) return err(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');

  const body = (await req.json().catch(() => null)) as { op?: string; payload?: unknown; request_id?: string } | null;
  const op = body?.op as AdminOp | undefined;
  if (!op || !(op in ADMIN_RPC)) return err(400, 'UNKNOWN_OP', 'Unknown operation.');

  const parsed = ADMIN_RPC[op].safeParse(body?.payload ?? {});
  if (!parsed.success) return err(422, 'VALIDATION', 'Please fix the highlighted fields.', zodDetails(parsed.error));

  const requestId = typeof body?.request_id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(body.request_id) ? body.request_id : undefined;
  if (MUTATING_OPS.has(op) && !requestId) return err(400, 'BAD_REQUEST', 'Missing request id.');

  try {
    const data = await callBackend(op, parsed.data, { actorId: session.sub, requestId });
    if (MUTATING_OPS.has(op)) revalidateTag(PUBLIC_DATA_TAG);
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BackendCallError) {
      const status = e.code === 'VALIDATION' || e.code === 'DUPLICATE' || e.code === 'BATCH_BELOW_PLACED' ? 422
        : e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : e.retryable ? 503 : 502;
      return err(status, e.code, e.message, e.details, e.retryable);
    }
    console.error('admin rpc failed', op, e);
    return err(500, 'INTERNAL', 'Unexpected error.');
  }
}
