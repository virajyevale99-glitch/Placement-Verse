import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { assertBackendConfigured, serverEnv } from '../env';
import type { BackendError, BackendResponse } from '../types';

export class BackendCallError extends Error {
  readonly code: string;
  readonly details: BackendError['details'];
  readonly retryable: boolean;
  constructor(err: BackendError) {
    super(err.message);
    this.name = 'BackendCallError';
    this.code = err.code;
    this.details = err.details ?? [];
    this.retryable = !!err.retryable;
  }
}

interface CallOptions {
  actorId?: string;
  requestId?: string;
  /** Retries for transient failures. Only used for reads or requests with a requestId (idempotent). */
  retries?: number;
  timeoutMs?: number;
}

function sign(body: string, ts: number): string {
  return createHmac('sha256', serverEnv.appsScriptSecret).update(`${ts}.${body}`).digest('hex');
}

async function once<T>(op: string, payload: unknown, opts: CallOptions): Promise<T> {
  const body = JSON.stringify({ op, payload, actor_id: opts.actorId, request_id: opts.requestId, nonce: randomUUID() });
  const ts = Date.now();
  let res: Response;
  try {
    res = await fetch(serverEnv.appsScriptUrl, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ body, ts, sig: sign(body, ts) }),
      redirect: 'follow', // Apps Script answers via a 302 to script.googleusercontent.com
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
  } catch {
    throw new BackendCallError({ code: 'NETWORK', message: 'Could not reach the data service. Please retry.', details: [], retryable: true });
  }
  const text = await res.text();
  let parsed: BackendResponse<T>;
  try {
    parsed = JSON.parse(text) as BackendResponse<T>;
  } catch {
    const looksLikeLogin = /accounts\.google\.com|<html/i.test(text);
    throw new BackendCallError({
      code: looksLikeLogin ? 'MISCONFIGURED' : 'BAD_RESPONSE',
      message: looksLikeLogin
        ? 'The Apps Script web app is not deployed with access "Anyone". See docs/SETUP.md step 4.'
        : `Unexpected response from the data service (HTTP ${res.status}).`,
      details: [],
      retryable: res.status >= 500,
    });
  }
  if (!parsed.ok) throw new BackendCallError(parsed.error);
  return parsed.data;
}

/** Calls one Apps Script operation with an HMAC-signed envelope. Server-side only. */
export async function callBackend<T>(op: string, payload: unknown = {}, opts: CallOptions = {}): Promise<T> {
  assertBackendConfigured();
  const idempotent = op.startsWith('public.') || op.startsWith('auth.') || !!opts.requestId || /\.(list|get|overview)$/.test(op);
  const retries = idempotent ? (opts.retries ?? 2) : 0;
  let attempt = 0;
  for (;;) {
    try {
      return await once<T>(op, payload, opts);
    } catch (e) {
      const err = e as BackendCallError;
      if (attempt >= retries || !(err instanceof BackendCallError) || !err.retryable) throw err;
      attempt++;
      await new Promise((r) => setTimeout(r, 400 * attempt + Math.random() * 300));
    }
  }
}
