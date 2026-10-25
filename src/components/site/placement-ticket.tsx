import Link from 'next/link';
import { PartyPopper } from 'lucide-react';
import type { PublicPlacement } from '@/lib/types';
import { formatCtc, formatDate, hueFor, initials } from '@/lib/core/placements';
import { CompanyMark } from './company-mark';
import { cn } from '@/lib/utils';

/** The ticket stub: one announcement, one student, equal visual weight for everyone. */
export function PlacementTicket({ p, showCompany = true, className }: { p: PublicPlacement; showCompany?: boolean; className?: string }) {
  const h = hueFor(p.student_id);
  return (
    <article className={cn('ticket flex flex-col', className)} aria-label={`${p.student_name} placed at ${p.company_name}`}>
      <div className="flex items-start gap-3 p-4 pb-5">
        {p.student_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- optional admin-provided photo, shown only when enabled
          <img src={p.student_photo_url} alt="" className="size-12 shrink-0 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-full font-display text-base font-semibold"
            style={{ background: `hsl(${h} 45% 20%)`, color: `hsl(${h} 85% 85%)` }}>
            {initials(p.student_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight text-ink">
            <Link href={`/students/${p.student_id}`} className="hover:text-champagne focus-visible:text-champagne">{p.student_name}</Link>
          </h3>
        </div>
        <PartyPopper className="size-4 shrink-0 text-champagne/80" aria-hidden />
      </div>
      <div className="ticket-perf mt-auto flex items-center gap-3 px-4 py-3">
        {showCompany ? <CompanyMark id={p.company_id} name={p.company_name} logoUrl={p.company_logo_url} size="sm" /> : null}
        <div className="min-w-0 flex-1">
          {showCompany ? (
            <Link href={`/companies/${p.company_id}`} className="block truncate text-sm font-medium text-ink hover:text-champagne">{p.company_name}</Link>
          ) : null}
          <p className="text-xs text-dim">
            <time dateTime={p.placement_date}>{formatDate(p.placement_date)}</time>
          </p>
        </div>
        {p.ctc !== undefined ? <span className="tabular shrink-0 rounded-full bg-champagne/10 px-2 py-0.5 text-xs font-semibold text-champagne">{formatCtc(p.ctc, p.currency)}</span> : null}
      </div>
    </article>
  );
}
