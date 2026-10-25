import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADMIN_PASSWORD, verifyAdminPassword } from '../src/lib/auth/password';
import { signSession, verifySession, SESSION_TTL_SECONDS } from '../src/lib/auth/session';
import { ADMINS, findAdminById, findAdminByUsername } from '../src/lib/auth/admins';
import { checkLocalThrottle, recordLocalThrottle } from '../src/lib/auth/throttle';

const SECRET = 'a-very-long-session-secret-for-tests-0123456789';

test('both admins share the fixed password; anything else is rejected', () => {
  assert.equal(ADMIN_PASSWORD, 'DivisionDRocks');
  assert.equal(verifyAdminPassword('DivisionDRocks'), true);
  assert.equal(verifyAdminPassword('divisiondrocks'), false);
  assert.equal(verifyAdminPassword('1234'), false);
  assert.equal(verifyAdminPassword(''), false);
  assert.equal(verifyAdminPassword('DivisionDRocks '), false);
});

test('sessions: valid, tampered, wrong secret, expired, malformed', async () => {
  const now = 1_800_000_000;
  const t = await signSession({ sub: 'adm_viraj', name: 'Viraj Yevale' }, SECRET, now);
  const ok = await verifySession(t, SECRET, now + 10);
  assert.equal(ok?.sub, 'adm_viraj');
  assert.equal(ok?.exp, now + SESSION_TTL_SECONDS);

  const [part, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'adm_uditi', name: 'x', iat: now, exp: now + 999999 })).toString('base64url');
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET, now), null, 'cannot change identity without the secret');
  assert.equal(await verifySession(t, SECRET.replace('a', 'b'), now), null);
  assert.equal(await verifySession(t, SECRET, now + SESSION_TTL_SECONDS + 1), null, 'expired');
  assert.equal(await verifySession(`${part}.${sig}.x`, SECRET, now), null);
  assert.equal(await verifySession('', SECRET, now), null);
  assert.equal(await verifySession(t, undefined, now), null);
  await assert.rejects(signSession({ sub: 'x', name: 'x' }, 'short'));
});

test('exactly two administrators exist, and a name alone grants nothing', async () => {
  assert.deepEqual(ADMINS.map((a) => a.displayName), ['Viraj Yevale', 'Uditi']);
  assert.equal(findAdminByUsername(' Viraj ')?.id, 'adm_viraj');
  assert.equal(findAdminByUsername('admin'), undefined);
  assert.equal(findAdminById('adm_root'), undefined);
  // Knowing the username alone is useless without the password.
  assert.equal(verifyAdminPassword('viraj'), false);
});

test('local login throttle blocks after 5 failures and resets on success', () => {
  const key = `t-${Math.random()}`;
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordLocalThrottle(key, false, now);
  assert.equal(checkLocalThrottle(key, now), true);
  assert.equal(checkLocalThrottle(key, now + 16 * 60 * 1000), false, 'window expires');
  recordLocalThrottle(key, true, now);
  assert.equal(checkLocalThrottle(key, now), false);
});

test('no secret or password reaches client code or public env vars', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  const files = walk(fileURLToPath(new URL('../src', import.meta.url))).filter((f) => /\.(tsx?|css)$/.test(f));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/process\.env\.NEXT_PUBLIC_(?!SITE_URL)/.test(src), `${f} uses a NEXT_PUBLIC_ variable other than SITE_URL`);
    if (src.startsWith("'use client'")) {
      assert.ok(!/process\.env\.(ADMIN|APPS_SCRIPT|GOOGLE)/.test(src), `${f} reads a server secret in client code`);
      assert.ok(!/from '@\/lib\/(env|backend\/client|auth\/password|auth\/guard|admin-server)'/.test(src), `${f} imports server-only code`);
      assert.ok(!/DivisionDRocks/.test(src), `${f} contains the admin password`);
    }
  }
});
