import type { PlacementStats } from '@/lib/types';
import { CountUp } from './count-up';

/** The four required metrics, in one panel so they read as one fact about the batch. */
export function StatsStrip({ stats }: { stats: PlacementStats }) {
  const items = [
    { label: 'Total students', value: stats.total_students, tone: 'text-ink' },
    { label: 'Students placed', value: stats.placed_students, tone: 'text-mint' },
    { label: 'Yet to be placed', value: stats.yet_to_be_placed, tone: 'text-ink' },
    { label: 'Placement rate', value: stats.placement_rate, tone: 'text-champagne', suffix: '%', decimals: Number.isInteger(stats.placement_rate) ? 0 : 1 },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-indigo-deep md:grid-cols-4">
      {items.map((it, i) => (
        <div key={it.label} className={`px-5 py-6 sm:px-7 ${i % 2 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t border-line md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''}`}>
          <dt className="text-sm text-mist">{it.label}</dt>
          <dd className={`mt-2 font-display text-4xl font-semibold sm:text-5xl ${it.tone}`}>
            <CountUp value={it.value} suffix={it.suffix} decimals={it.decimals} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ stats }: { stats: PlacementStats }) {
  const pct = Math.min(100, Math.max(0, stats.placement_rate));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-mist">
          <span className="font-semibold text-mint">{stats.placed_students}</span> placed
          <span className="mx-2 text-dim">/</span>
          <span className="font-semibold text-ink">{stats.yet_to_be_placed}</span> to go
        </span>
        <span className="tabular font-semibold text-champagne">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Placement rate">
        <div className="h-full rounded-full bg-gradient-to-r from-mint to-champagne transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
