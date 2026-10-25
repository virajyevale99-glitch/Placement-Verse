import Link from 'next/link';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container, SectionTitle } from '@/components/site/section';
import { SeatMap } from '@/components/site/seat-map';
import { ProgressBar, StatsStrip } from '@/components/site/stats-strip';
import { PlacementTicket } from '@/components/site/placement-ticket';
import { CompanyMark } from '@/components/site/company-mark';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { formatDate } from '@/lib/core/placements';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const snap = await getPublicSnapshot();
  const { stats } = snap;
  const limit = Math.min(48, Math.max(3, Number(snap.config.latest_wins_limit) || 12));
  const latest = snap.config.announcements_enabled === 'false' ? [] : snap.placements.slice(0, limit);
  const latestDate = snap.placements[0]?.placement_date;
  const latestDayCount = latestDate ? snap.placements.filter((p) => p.placement_date === latestDate).length : 0;

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <Container className="grid items-center gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-24">
          <div>
            {snap.batch ? <p className="text-sm text-mist">{snap.batch.batch_name}</p> : null}
            <h1 id="hero-title" className="font-display mt-4 text-5xl font-semibold leading-[0.98] text-ink sm:text-6xl xl:text-7xl">
              Big Dreams.
              <br />
              Bigger Offers.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-mist">
              Celebrating the talent, hard work, and achievements of our students as they begin their next chapter.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="celebrate"><Link href="/students">Explore Placed Students</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/companies">Discover Companies</Link></Button>
            </div>
            {latestDate ? (
              <p className="mt-8 text-sm text-mist">
                Latest: {latestDayCount} {latestDayCount === 1 ? 'offer' : 'offers'} on {formatDate(latestDate)}.{' '}
                <Link href="/celebrations" className="text-champagne underline-offset-4 hover:underline">See every win</Link>
              </p>
            ) : null}
          </div>

          <div className="glass rounded-[28px] p-6 sm:p-8">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <h2 className="font-display text-xl text-ink">The batch, seat by seat</h2>
              <p className="tabular text-sm text-mist">{stats.placed_students} of {stats.total_students}</p>
            </div>
            <SeatMap total={stats.total_students} placed={stats.placed_students} />
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-mist">
              <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-mint" /> Placed</span>
              <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-line" /> Yet to be placed</span>
            </div>
            <div className="mt-6"><ProgressBar stats={stats} /></div>
          </div>
        </Container>
      </section>

      {/* Statistics */}
      <section aria-label="Placement statistics">
        <Container><StatsStrip stats={stats} /></Container>
      </section>

      {/* Latest wins */}
      <section aria-labelledby="wins-title" className="mt-24">
        <Container>
          <SectionTitle id="wins-title" title="Latest wins" lead="The newest offers, as they're announced. Every placed student is also listed in the full directory."
            action={<Button asChild variant="outline"><Link href="/celebrations">Open the celebration wall</Link></Button>} />
          {latest.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((p) => <li key={p.placement_id}><PlacementTicket p={p} className="h-full" /></li>)}
            </ul>
          ) : (
            <EmptyState title="The first offer is on its way" body="Placements appear here the moment an announcement is published." />
          )}
          {snap.placements.length > latest.length ? (
            <p className="mt-6 text-sm text-mist">
              Showing the {latest.length} newest of {snap.placements.length} announcements.{' '}
              <Link href="/students" className="text-champagne underline-offset-4 hover:underline">Browse all placed students</Link>
            </p>
          ) : null}
        </Container>
      </section>

      {/* Companies */}
      <section aria-labelledby="companies-title" className="mt-24">
        <Container>
          <SectionTitle id="companies-title" title="Where our students are going" lead="Recruiters who made offers to this batch."
            action={<Button asChild variant="outline"><Link href="/companies">All companies</Link></Button>} />
          {snap.companies.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {snap.companies.slice(0, 6).map((c) => (
                <li key={c.company_id}>
                  <Link href={`/companies/${c.company_id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-indigo-deep p-4 transition-colors hover:border-violet/50">
                    <CompanyMark id={c.company_id} name={c.display_name} logoUrl={c.logo_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{c.display_name}</p>
                      <p className="truncate text-sm text-mist">{c.offers} {c.offers === 1 ? 'offer' : 'offers'}</p>
                    </div>
                    <p className="text-right">
                      <span className="tabular block font-display text-2xl font-semibold text-mint">{c.placed_students}</span>
                      <span className="text-xs text-dim">{c.placed_students === 1 ? 'student' : 'students'}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recruiters yet" body="Companies show up here once their first offer is published." />
          )}
        </Container>
      </section>
    </>
  );
}
