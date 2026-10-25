import { NextResponse } from 'next/server';
import { getPublicSnapshot } from '@/lib/backend/public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Used by the celebration wall's polling. Returns only the allowlisted public snapshot.
export async function GET() {
  try {
    const snapshot = await getPublicSnapshot();
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
