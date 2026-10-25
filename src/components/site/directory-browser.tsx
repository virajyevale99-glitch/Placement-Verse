'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import type { PublicPlacement } from '@/lib/types';
import { buildDirectory, filterDirectory, formatDate, paginate, initials, hueFor } from '@/lib/core/placements';
import { Input, Label, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { CompanyMark } from './company-mark';

const PAGE_SIZE = 24;

export function DirectoryBrowser({ placements, companies }: { placements: PublicPlacement[]; companies: { id: string; name: string }[] }) {
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'name'>('newest');
  const [page, setPage] = useState(1);

  const all = useMemo(() => buildDirectory(placements), [placements]);
  const filtered = useMemo(() => filterDirectory(all, { query, companyId, from, to, sort }), [all, query, companyId, from, to, sort]);
  const view = paginate(filtered, page, PAGE_SIZE);
  const hasFilters = !!(query || companyId || from || to);
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <div>
      <form role="search" className="grid gap-4 rounded-2xl border border-line bg-indigo-deep p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_1fr]" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search by name</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
            <Input id="q" type="search" placeholder="Start typing a name" className="pl-9" value={query} onChange={(e) => set(setQuery)(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="company">Company</Label>
          <Select id="company" value={companyId} onChange={(e) => set(setCompanyId)(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">Placed from</Label>
          <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => set(setFrom)(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Placed until</Label>
          <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => set(setTo)(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sort">Sort</Label>
          <Select id="sort" value={sort} onChange={(e) => set(setSort)(e.target.value as 'newest' | 'name')}>
            <option value="newest">Newest first</option>
            <option value="name">A to Z</option>
          </Select>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-mist" aria-live="polite">
        <p>
          {hasFilters ? <>Showing <strong className="text-ink">{filtered.length}</strong> of {all.length} placed students</> : <><strong className="text-ink">{all.length}</strong> placed students</>}
        </p>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setCompanyId(''); setFrom(''); setTo(''); setPage(1); }}>
            <X /> Clear filters
          </Button>
        ) : null}
      </div>

      {view.items.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-indigo-deep">
          {view.items.map((e) => {
            const h = hueFor(e.student_id);
            const first = e.offers[0];
            return (
              <li key={e.student_id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] sm:items-center sm:gap-6 sm:px-6">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold"
                    style={{ background: `hsl(${h} 45% 20%)`, color: `hsl(${h} 85% 85%)` }}>{initials(e.student_name)}</span>
                  <div className="min-w-0">
                    <Link href={`/students/${e.student_id}`} className="block truncate font-medium text-ink hover:text-champagne">{e.student_name}</Link>
                    {e.department ? <p className="text-xs text-dim">{e.department}</p> : null}
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyMark id={first.company_id} name={first.company_name} logoUrl={first.company_logo_url} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{first.company_name}</p>
                    {e.offers.length > 1 ? (
                      <p className="truncate text-xs text-champagne">+ {e.offers.slice(1).map((o) => o.company_name).join(', ')}</p>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-mist sm:text-right"><time dateTime={e.latest_placement_date}>{formatDate(e.latest_placement_date)}</time></p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState title={all.length ? 'No students match these filters' : 'No placements published yet'}
            body={all.length ? 'Try a different name, company or date range.' : 'Placed students will be listed here as soon as their announcements go live.'} />
        </div>
      )}

      {view.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button>
          <p className="text-sm text-mist">Page {view.page} of {view.totalPages}</p>
          <Button variant="outline" size="sm" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}
