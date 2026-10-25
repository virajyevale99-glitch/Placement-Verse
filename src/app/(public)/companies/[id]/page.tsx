import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container } from '@/components/site/section';
import { CompanyMark } from '@/components/site/company-mark';
import { PlacementTicket } from '@/components/site/placement-ticket';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';

async function load(id: string) {
  const snap = await getPublicSnapshot();
  const company = snap.companies.find((c) => c.company_id === id);
  if (!company) return null;
  return { company, placements: snap.placements.filter((p) => p.company_id === id) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const data = await load((await params).id);
  return data ? { title: data.company.display_name, description: `${data.company.placed_students} students placed at ${data.company.display_name}.` } : { title: 'Company not found' };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { company: c, placements } = data;
  return (
    <Container className="pb-8 pt-14 sm:pt-20">
      <Link href="/companies" className="text-sm text-mist hover:text-ink">Back to all companies</Link>
      <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <CompanyMark id={c.company_id} name={c.display_name} logoUrl={c.logo_url} size="lg" />
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">{c.display_name}</h1>
            {c.website_url ? <a href={c.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-mist hover:text-ink">{c.website_url.replace(/^https:\/\//, '')}</a> : null}
          </div>
        </div>
        <p className="text-mist"><span className="tabular font-display text-4xl font-semibold text-mint">{c.placed_students}</span> {c.placed_students === 1 ? 'student' : 'students'} placed</p>
      </div>
      <h2 className="sr-only">All published placements at {c.display_name}</h2>
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {placements.map((p) => <li key={p.placement_id}><PlacementTicket p={p} showCompany={false} className="h-full" /></li>)}
      </ul>
    </Container>
  );
}
