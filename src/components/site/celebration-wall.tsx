'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { PublicSnapshot } from '@/lib/types';
import { buildCohorts, formatDate, todayIn } from '@/lib/core/placements';
import { PlacementTicket } from './placement-ticket';
import { CompanyMark } from './company-mark';
import { ConfettiBurst } from './confetti';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const POLL_MS = 60_000; // Apps Script has no push channel, so the wall polls the cached snapshot.
const DAYS_STEP = 7;

export function CelebrationWall({ initial }: { initial: PublicSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [daysShown, setDaysShown] = useState(DAYS_STEP);
  const [grouping, setGrouping] = useState<'company' | 'all'>('company');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [burst, setBurst] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const known = useRef(new Set(initial.placements.map((p) => p.placement_id)));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/public/snapshot', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as PublicSnapshot;
      const added = next.placements.filter((p) => !known.current.has(p.placement_id)).map((p) => p.placement_id);
      next.placements.forEach((p) => known.current.add(p.placement_id));
      setSnap(next);
      setStale(false);
      if (added.length) {
        setFresh(new Set(added));
        setBurst((b) => b + 1);
      }
    } catch {
      setStale(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const cohorts = useMemo(() => buildCohorts(snap.placements), [snap.placements]);
  const today = todayIn(snap.batch?.timezone || snap.config.display_timezone || 'Asia/Kolkata');
  const visible = cohorts.slice(0, daysShown);
  const totalShown = visible.reduce((n, d) => n + d.announcement_count, 0);

  if (!cohorts.length) {
    return <EmptyState title="The wall is ready for its first win" body="As soon as an offer is published it will appear here, grouped with everyone placed the same day." />;
  }

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-midnight/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-line">
        <div className="flex rounded-xl border border-line p-1" role="group" aria-label="Group cards">
          {(['company', 'all'] as const).map((g) => (
            <button key={g} type="button" aria-pressed={grouping === g} onClick={() => setGrouping(g)}
              className={cn('rounded-lg px-3 py-1.5 text-sm transition-colors', grouping === g ? 'bg-white/10 text-ink' : 'text-mist hover:text-ink')}>
              {g === 'company' ? 'By company' : 'Everyone together'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-mist" aria-live="polite">
          {fresh.size ? <span className="inline-flex items-center gap-1 text-champagne"><Sparkles className="size-3.5" /> {fresh.size} new</span> : null}
          {stale ? <span className="text-danger">Couldn&apos;t refresh. Showing the last update.</span> : <span>Updates every minute</span>}
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh now">
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <ol className="grid gap-14">
        {visible.map((day, i) => (
          <li key={day.date}>
            <details open={i < 3} className="group">
              <summary className="relative flex cursor-pointer list-none flex-col gap-2 rounded-2xl py-2 sm:flex-row sm:items-end sm:justify-between [&::-webkit-details-marker]:hidden">
                {i === 0 ? <ConfettiBurst trigger={burst} /> : null}
                <h2 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
                  <time dateTime={day.date}>{day.date === today ? 'Today' : formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</time>
                  {day.date === today ? <span className="ml-3 align-middle text-base font-normal text-mist">{formatDate(day.date)}</span> : null}
                </h2>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mist">
                  <span><strong className="tabular text-champagne">{day.unique_students}</strong> {day.unique_students === 1 ? 'student' : 'students'}</span>
                  <span><strong className="tabular text-ink">{day.announcement_count}</strong> {day.announcement_count === 1 ? 'announcement' : 'announcements'}</span>
                  <span><strong className="tabular text-ink">{day.company_count}</strong> {day.company_count === 1 ? 'company' : 'companies'}</span>
                  <span className="text-dim group-open:hidden">Show</span>
                  <span className="hidden text-dim group-open:inline">Hide</span>
                </p>
              </summary>

              {grouping === 'company' ? (
                <div className="mt-6 grid gap-8">
                  {day.companies.map((g) => (
                    <section key={g.company_id} aria-label={`${g.company_name}, ${g.placements.length} placed`}>
                      <div className="mb-4 flex items-center gap-3">
                        <CompanyMark id={g.company_id} name={g.company_name} logoUrl={g.company_logo_url} size="sm" />
                        <h3 className="font-medium text-ink">{g.company_name}</h3>
                        <span className="tabular rounded-full bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">{g.placements.length}</span>
                      </div>
                      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {g.placements.map((p) => (
                          <li key={p.placement_id}>
                            <PlacementTicket p={p} showCompany={false} className={cn('h-full', fresh.has(p.placement_id) && 'ring-2 ring-champagne/60')} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {day.placements.map((p) => (
                    <li key={p.placement_id}>
                      <PlacementTicket p={p} className={cn('h-full', fresh.has(p.placement_id) && 'ring-2 ring-champagne/60')} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-col items-center gap-3 text-center text-sm text-mist">
        <p>
          Showing {visible.length} of {cohorts.length} {cohorts.length === 1 ? 'day' : 'days'}, {totalShown} of {snap.placements.length} announcements.
        </p>
        {daysShown < cohorts.length ? (
          <Button variant="outline" onClick={() => setDaysShown((d) => d + DAYS_STEP)}>
            Show {Math.min(DAYS_STEP, cohorts.length - daysShown)} earlier {Math.min(DAYS_STEP, cohorts.length - daysShown) === 1 ? 'day' : 'days'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
