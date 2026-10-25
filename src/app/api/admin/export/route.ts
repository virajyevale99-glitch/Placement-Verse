import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guard';
import { callBackend } from '@/lib/backend/client';
import { toCsv } from '@/lib/core/csv';
import { exportInput } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET is safe here: it only reads, requires the SameSite=Strict session cookie, and returns a download.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = exportInput.safeParse({ entity: new URL(req.url).searchParams.get('entity') });
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { rows } = await callBackend<{ rows: Record<string, unknown>[] }>('admin.export', parsed.data, { actorId: session.sub });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="placementverse-${parsed.data.entity}-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
