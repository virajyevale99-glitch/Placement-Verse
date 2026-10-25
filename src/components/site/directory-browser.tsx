'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Search, X } from 'lucide-react';
import type { PublicPlacement, PublicStudent } from '@/lib/types';
import { buildDirectory, filterDirectory, formatDate, paginate, initials, hueFor } from '@/lib/core/placements';
import { Input, Label, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { CompanyMark } from './company-mark';

const PAGE_SIZE = 24;

export function DirectoryBrowser({
  placements,
  students,
  companies,
}: {
  placements: PublicPlacement[];
  students?: PublicStudent[];
  companies: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'placed' | 'unplaced'>('all');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'name'>('name');
  const [page, setPage] = useState(1);

  const all = useMemo(() => buildDirectory(placements, students), [placements, students]);
  const placedCount = useMemo(() => all.filter((s) => s.status === 'placed').length, [all]);
  const unplacedCount = useMemo(() => all.filter((s) => s.status === 'unplaced').length, [all]);

  const filtered = useMemo(
    () => filterDirectory(all, { query, companyId, from, to, status, sort }),
    [all, query, companyId, from, to, status, sort]
  );
  const view = paginate(filtered, page, PAGE_SIZE);
  const hasFilters = !!(query || companyId || from || to || status !== 'all');
  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div>
      {/* Quick Status Pill Filter Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setStatus('all'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            status === 'all'
              ? 'bg-champagne text-midnight shadow-sm'
              : 'border border-line bg-indigo-deep text-mist hover:text-ink hover:bg-white/5'
          }`}
        >
          All Students
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === 'all' ? 'bg-midnight/20 text-midnight' : 'bg-white/10 text-mist'}`}>
            {all.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setStatus('unplaced'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            status === 'unplaced'
              ? 'bg-amber-400 text-midnight shadow-sm'
              : 'border border-line bg-indigo-deep text-mist hover:text-ink hover:bg-white/5'
          }`}
        >
          <Clock className="size-3.5" />
          Yet to be placed
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === 'unplaced' ? 'bg-midnight/20 text-midnight' : 'bg-white/10 text-mist'}`}>
            {unplacedCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setStatus('placed'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            status === 'placed'
              ? 'bg-emerald-400 text-midnight shadow-sm'
              : 'border border-line bg-indigo-deep text-mist hover:text-ink hover:bg-white/5'
          }`}
        >
          <CheckCircle2 className="size-3.5" />
          Placed
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === 'placed' ? 'bg-midnight/20 text-midnight' : 'bg-white/10 text-mist'}`}>
            {placedCount}
          </span>
        </button>
      </div>

      {/* Advanced Filter & Search Grid */}
      <form
        role="search"
        className="grid gap-4 rounded-2xl border border-line bg-indigo-deep p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_1fr]"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search student or roll no.</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
            <Input
              id="q"
              type="search"
              placeholder="e.g. D001, Aashish, Viraj"
              className="pl-9"
              value={query}
              onChange={(e) => set(setQuery)(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="company">Company</Label>
          <Select id="company" value={companyId} onChange={(e) => set(setCompanyId)(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
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
            <option value="name">Roll No / A to Z</option>
            <option value="newest">Newest placement</option>
          </Select>
        </div>
      </form>

      {/* Filter Stats & Reset */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-mist" aria-live="polite">
        <p>
          {hasFilters ? (
            <>
              Showing <strong className="text-ink">{filtered.length}</strong> of {all.length} students
            </>
          ) : (
            <>
              <strong className="text-ink">{all.length}</strong> students in Division D
            </>
          )}
        </p>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setStatus('all');
              setCompanyId('');
              setFrom('');
              setTo('');
              setSort('name');
              setPage(1);
            }}
          >
            <X className="size-4" /> Clear filters
          </Button>
        ) : null}
      </div>

      {/* Student List */}
      {view.items.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-indigo-deep">
          {view.items.map((e) => {
            const h = hueFor(e.student_id);
            const isPlaced = e.status === 'placed' && e.offers.length > 0;
            const first = isPlaced ? e.offers[0] : null;

            return (
              <li
                key={e.student_id}
                className="grid gap-3 p-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-6 sm:px-6"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold shadow-inner"
                    style={{ background: `hsl(${h} 45% 20%)`, color: `hsl(${h} 85% 85%)` }}
                  >
                    {initials(e.student_name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/students/${e.student_id}`}
                        className="truncate font-medium text-ink hover:text-champagne transition-colors"
                      >
                        {e.student_name}
                      </Link>
                      {e.roll_number ? (
                        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-mist">
                          {e.roll_number}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-dim">{e.department ? `${e.department} • Div D` : 'MBA Division D'}</p>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  {isPlaced && first ? (
                    <>
                      <CompanyMark id={first.company_id} name={first.company_name} logoUrl={first.company_logo_url} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{first.company_name}</p>
                        {e.offers.length > 1 ? (
                          <p className="truncate text-xs text-champagne font-medium">
                            + {e.offers.slice(1).map((o) => o.company_name).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-dim text-xs">
                      <span className="size-2 rounded-full bg-mist/40" />
                      <span>Placement in progress</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  {isPlaced && e.latest_placement_date ? (
                    <div className="text-right">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/20">
                        Placed
                      </span>
                      <p className="mt-1 text-xs text-dim">
                        <time dateTime={e.latest_placement_date}>{formatDate(e.latest_placement_date)}</time>
                      </p>
                    </div>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-mist border border-line">
                      Yet to be placed
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState
            title={all.length ? 'No students match these filters' : 'No students found'}
            body={
              all.length
                ? `No candidate in Division D matched your search "${query}". Try searching by roll number (e.g. D001) or first name.`
                : 'No candidate records available in this batch.'
            }
          />
        </div>
      )}

      {/* Pagination */}
      {view.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
            Previous
          </Button>
          <p className="text-sm text-mist">
            Page {view.page} of {view.totalPages}
          </p>
          <Button variant="outline" size="sm" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
