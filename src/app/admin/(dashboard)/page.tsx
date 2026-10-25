import Link from 'next/link';
import { adminRead } from '@/lib/admin-server';
import type { AdminOverview } from '@/lib/types';
import { AdminHeader, formatStamp } from '@/components/admin/bits';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/misc';
import { ProgressBar } from '@/components/site/stats-strip';

export const metadata = { title: 'Overview' };

export default async function AdminOverviewPage() {
  const o = await adminRead<AdminOverview>('admin.overview');
  const tiles = [
    { label: 'Batch size', value: o.stats.total_students },
    { label: 'Unique students placed', value: o.stats.placed_students, tone: 'text-mint' },
    { label: 'Students remaining', value: o.stats.yet_to_be_placed },
    { label: 'Placement rate', value: `${o.stats.placement_rate}%`, tone: 'text-champagne' },
    { label: 'Companies', value: o.total_companies },
    { label: 'Published announcements', value: o.published_announcements },
    { label: 'Drafts waiting', value: o.draft_announcements, tone: o.draft_announcements ? 'text-violet-300' : undefined },
    { label: 'Registered students', value: o.registered_students },
  ];
  return (
    <>
      <AdminHeader title="Overview" lead={o.batch ? `${o.batch.batch_name}. Numbers count published placements only.` : 'No active batch. Create one under Batches.'}
        actions={<><Button asChild variant="celebrate"><Link href="/admin/placements/new">Add placements</Link></Button><Button asChild variant="outline"><Link href="/admin/students">Add students</Link></Button></>} />
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5">
            <dt className="text-sm text-mist">{t.label}</dt>
            <dd className={`tabular mt-2 font-display text-3xl font-semibold ${t.tone ?? 'text-ink'}`}>{t.value}</dd>
          </Card>
        ))}
      </dl>
      <Card className="mt-6 p-5"><ProgressBar stats={o.stats} /></Card>
      {o.registered_students > o.stats.total_students ? (
        <p className="mt-4 text-sm text-champagne">There are more registered students ({o.registered_students}) than the batch strength ({o.stats.total_students}). Check the batch size under Batches.</p>
      ) : null}
      <section className="mt-10" aria-labelledby="activity-title">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="activity-title" className="font-display text-xl text-ink">Recent activity</h2>
          <Link href="/admin/activity" className="text-sm text-mist hover:text-ink">Full activity log</Link>
        </div>
        {o.recent_activity.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-indigo-deep">
            {o.recent_activity.map((l) => (
              <li key={l.log_id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink"><span className="font-medium">{l.actor_name}</span> <span className="text-mist">{l.action.replace(/[._]/g, ' ')}</span> <span className="text-dim">{l.change_summary}</span></p>
                <time className="shrink-0 text-xs text-dim" dateTime={l.created_at}>{formatStamp(l.created_at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No activity yet" body="Changes made by either administrator are recorded here." />
        )}
      </section>
    </>
  );
}
