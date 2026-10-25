// Per-instance fallback limiter. The shared limiter lives in Apps Script CacheService;
// this one still protects a warm serverless instance if that call fails.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkLocalThrottle(key: string, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt < now) return false;
  return b.count >= MAX_FAILS;
}

export function recordLocalThrottle(key: string, success: boolean, now = Date.now()): void {
  if (success) {
    buckets.delete(key);
    return;
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else b.count++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}
