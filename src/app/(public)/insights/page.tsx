import type { Metadata } from 'next';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container, PageHeader } from '@/components/site/section';
import { ColumnChart, CumulativeChart, HBarChart } from '@/components/site/charts';
import { StatsStrip } from '@/components/site/stats-strip';
import { Card, EmptyState } from '@/components/ui/misc';
import { dailySeries, formatDate } from '@/lib/core/placements';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Insights', description: 'Placement activity by company and by day.' };

export default async function InsightsPage() {
  const snap = await getPublicSnapshot();
  const series = dailySeries(snap.placements);
  const busiest = series.reduce<(typeof series)[number] | null>((b, d) => (!b || d.offers > b.offers ? d : b), null);

  return (
    <>
      <PageHeader title="Insights" lead="How the batch's placement season is unfolding, from published announcements only." />
      <Container className="grid gap-6">
        <StatsStrip stats={snap.stats} />
        {!snap.placements.length ? (
          <EmptyState title="Nothing to chart yet" body="Charts appear once the first placement is published." />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6">
                <h2 className="font-display text-xl text-ink">Students placed by company</h2>
                <p className="mb-6 mt-1 text-sm text-mist">Unique students per recruiter.</p>
                <HBarChart label="Students placed by company" data={snap.companies.slice(0, 12).map((c) => ({ name: c.display_name, value: c.placed_students }))} />
                {snap.companies.length > 12 ? <p className="mt-4 text-xs text-dim">Top 12 of {snap.companies.length} companies.</p> : null}
              </Card>
              <Card className="p-6">
                <h2 className="font-display text-xl text-ink">Students placed over time</h2>
                <p className="mb-6 mt-1 text-sm text-mist">Running total of unique students. A second offer does not count twice.</p>
                <CumulativeChart label="Cumulative unique students placed" total={snap.stats.total_students} data={series.map((d) => ({ date: d.date, value: d.cumulativeStudents }))} />
              </Card>
            </div>
            <Card className="p-6">
              <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl text-ink">Offers per placement day</h2>
                  <p className="mt-1 text-sm text-mist">Only days with at least one offer are shown.</p>
                </div>
                {busiest ? <p className="text-sm text-mist">Busiest day: <span className="text-champagne">{formatDate(busiest.date)}</span>, {busiest.offers} offers</p> : null}
              </div>
              <ColumnChart label="Offers per placement day" data={series.slice(-30).map((d) => ({ date: d.date, value: d.offers }))} />
              {series.length > 30 ? <p className="mt-2 text-xs text-dim">Last 30 placement days.</p> : null}
            </Card>
          </>
        )}
      </Container>
    </>
  );
}
