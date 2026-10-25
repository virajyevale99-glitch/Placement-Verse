import 'server-only';
import { unstable_cache } from 'next/cache';
import { callBackend } from './client';
import { serverEnv } from '../env';
import { demoSnapshot } from '../demo';
import type { PublicSnapshot } from '../types';

export const PUBLIC_DATA_TAG = 'public-data';
export const PUBLIC_REVALIDATE_SECONDS = 60;

// The cache only ever holds the allowlisted public snapshot. Admin data is never cached.
const cachedSnapshot = unstable_cache(
  async () => callBackend<PublicSnapshot>('public.snapshot'),
  ['public-snapshot-v1'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_DATA_TAG] },
);

export async function getPublicSnapshot(): Promise<PublicSnapshot> {
  if (serverEnv.demoMode) return demoSnapshot();
  return cachedSnapshot();
}
