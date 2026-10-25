'use client';
// Browser-side caller for /api/admin/rpc. Every mutation gets a fresh request id so the
// backend can recognise and safely ignore an accidental double submit or network retry.
import type { BackendError } from './types';
import type { AdminOp } from './validation/schemas';

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: BackendError };

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function rpc<T>(op: AdminOp, payload: unknown = {}, requestId: string = newRequestId()): Promise<RpcResult<T>> {
  try {
    const res = await fetch('/api/admin/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, payload, request_id: requestId }),
      cache: 'no-store',
    });
    if (res.status === 401) {
      window.location.assign('/admin/login?expired=1');
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Session expired.', details: [], retryable: false } };
    }
    return (await res.json()) as RpcResult<T>;
  } catch {
    return { ok: false, error: { code: 'NETWORK', message: 'Network error. Check your connection and retry.', details: [], retryable: true } };
  }
}

/** Flattens backend/zod error details into { field: message } for form display. */
export function fieldErrors(error: BackendError | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of error?.details ?? []) {
    if (d.errors) for (const e of d.errors) out[e.field] ??= e.message;
    else if (d.field && d.message) out[d.field] ??= d.message;
  }
  return out;
}
