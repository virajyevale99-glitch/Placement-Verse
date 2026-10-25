// Both administrators share one fixed password. There is no hashing and no password env var.
// Server-only: never import this file from a client component.
import { createHash, timingSafeEqual } from 'node:crypto';

export const ADMIN_PASSWORD = 'DivisionDRocks';

const digest = (s: string) => createHash('sha256').update(s.normalize('NFKC')).digest();

/** Constant-time comparison (both sides are hashed to equal length first). */
export function verifyAdminPassword(input: string): boolean {
  return timingSafeEqual(digest(input), digest(ADMIN_PASSWORD));
}
