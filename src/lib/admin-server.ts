import 'server-only';
import { requireAdminPage } from './auth/guard';
import { callBackend } from './backend/client';
import type { AdminOp } from './validation/schemas';

/** Server-side read for admin pages: verifies the session, then calls Apps Script as that admin. Never cached. */
export async function adminRead<T>(op: AdminOp, payload: unknown = {}): Promise<T> {
  const session = await requireAdminPage();
  return callBackend<T>(op, payload, { actorId: session.sub });
}
