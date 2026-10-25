import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container, PageHeader } from '@/components/site/section';
import { CompanyMark } from '@/components/site/company-mark';
import { EmptyState } from '@/components/ui/misc';
import { formatDate } from '@/lib/core/placements';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Companies', description: 'Every company that made an offer to the batch.' };

export default async function CompaniesPage() {
  const snap = await getPublicSnapshot();
  return (
    <>
      <PageHeader title="Companies" lead={`${snap.companies.length} ${snap.companies.length === 1 ? 'company has' : 'companies have'} made offers to this batch. Open one to see everyone it hired.`} />
      <Container>
        {snap.companies.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {snap.companies.map((c) => (
              <li key={c.company_id}>
                <Link href={`/companies/${c.company_id}`} className="flex h-full flex-col rounded-2xl border border-line bg-indigo-deep p-5 transition-colors hover:border-violet/50">
                  <div className="flex items-center gap-4">
                    <CompanyMark id={c.company_id} name={c.display_name} logoUrl={c.logo_url} size="lg" />
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-xl text-ink">{c.display_name}</h2>
                      <p className="text-sm text-mist">Latest offer {formatDate(c.latest_placement_date)}</p>
                    </div>
                  </div>
                  <p className="mt-5 text-sm text-mist">
                    <span className="tabular font-display text-3xl font-semibold text-mint">{c.placed_students}</span>{' '}
                    {c.placed_students === 1 ? 'student placed' : 'students placed'}
                    {c.offers !== c.placed_students ? <span className="text-dim"> ({c.offers} offers)</span> : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No companies yet" body="Companies appear here once their first offer is published." />
        )}
      </Container>
    </>
  );
}
