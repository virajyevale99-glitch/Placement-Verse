// Signed, expiring session tokens using Web Crypto (works in middleware and in Node route handlers).
// token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payloadPart))

export const SESSION_COOKIE = 'pv_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionPayload {
  sub: string; // admin_id
  name: string;
  iat: number; // seconds
  exp: number; // seconds
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters.');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(
  input: { sub: string; name: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: SessionPayload = { sub: input.sub, name: input.name, iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const part = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(part)));
  return `${part}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token || !secret || token.length > 2048) return null;
  const [part, sig, extra] = token.split('.');
  if (!part || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig) as BufferSource, enc.encode(part));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(part))) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
    if (payload.iat > nowSeconds + 60) return null;
    return payload;
  } catch {
    return null;
  }
}
