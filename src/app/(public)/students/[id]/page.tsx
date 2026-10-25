import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container } from '@/components/site/section';
import { PlacementTicket } from '@/components/site/placement-ticket';
import { hueFor, initials } from '@/lib/core/placements';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';

async function load(id: string) {
  const snap = await getPublicSnapshot();
  const offers = snap.placements.filter((p) => p.student_id === id);
  return offers.length ? offers : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offers = await load((await params).id);
  if (!offers) return { title: 'Student not found' };
  return { title: offers[0].student_name, description: `${offers[0].student_name} was placed at ${offers.map((o) => o.company_name).join(', ')}.` };
}

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const offers = await load((await params).id);
  if (!offers) notFound();
  const s = offers[0];
  const h = hueFor(s.student_id);
  return (
    <Container className="max-w-4xl pb-8 pt-14 sm:pt-20">
      <Link href="/students" className="text-sm text-mist hover:text-ink">Back to all placed students</Link>
      <div className="mt-8 flex items-center gap-5">
        {s.student_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- optional admin-provided photo, shown only when enabled
          <img src={s.student_photo_url} alt={s.student_name} className="size-20 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden className="inline-flex size-20 items-center justify-center rounded-full font-display text-2xl font-semibold"
            style={{ background: `hsl(${h} 45% 20%)`, color: `hsl(${h} 85% 85%)` }}>{initials(s.student_name)}</span>
        )}
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink">{s.student_name}</h1>
          <p className="mt-1 text-mist">{[s.department, `${offers.length} ${offers.length === 1 ? 'offer' : 'offers'}`].filter(Boolean).join(', ')}</p>
        </div>
      </div>
      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {offers.map((p) => (
          <li key={p.placement_id}>
            <PlacementTicket p={p} className="h-full" />
            {p.announcement_message ? <p className="mt-3 whitespace-pre-line px-1 text-sm leading-relaxed text-mist">{p.announcement_message}</p> : null}
          </li>
        ))}
      </ul>
    </Container>
  );
}
