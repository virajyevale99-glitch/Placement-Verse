'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Search } from 'lucide-react';
import type { AdminCompany, AdminPlacement, AdminStudent } from '@/lib/types';
import { rpc } from '@/lib/admin-client';
import { formatDate, paginate } from '@/lib/core/placements';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { EmptyState, Notice } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge, Table, Td, Th } from './bits';
import { PlacementEditForm } from './placement-form';

const PAGE = 50;

export function PlacementsManager({ placements, students, companies, initialCompanyId = '' }: { placements: AdminPlacement[]; students: AdminStudent[]; companies: AdminCompany[]; initialCompanyId?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'draft' | 'published'>('');
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminPlacement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return placements.filter((p) =>
      (!status || p.publication_status === status) && (!companyId || p.company_id === companyId) && (!date || p.placement_date === date) &&
      (!needle || p.student_name.toLowerCase().includes(needle) || p.roll_number.toLowerCase().includes(needle) || p.company_name.toLowerCase().includes(needle)));
  }, [placements, q, status, companyId, date]);
  const view = paginate(filtered, page, PAGE);
  const allOnPage = view.items.length > 0 && view.items.every((p) => selected.has(p.placement_id));

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((s) => { const n = new Set(s); view.items.forEach((p) => (allOnPage ? n.delete(p.placement_id) : n.add(p.placement_id))); return n; });

  const setStatusFor = async (ids: string[], to: 'draft' | 'published') => {
    setBusy(true);
    setNotice(null);
    const res = await rpc<{ updated_count: number; failed_count: number }>('admin.placements.setStatus', { placement_ids: ids, status: to });
    setBusy(false);
    if (!res.ok) return setNotice({ tone: 'error', text: res.error.message });
    setNotice({ tone: res.data.failed_count ? 'error' : 'success', text: `${to === 'published' ? 'Published' : 'Moved to drafts'}: ${res.data.updated_count}.${res.data.failed_count ? ` ${res.data.failed_count} could not be changed (student archived or missing).` : ''}` });
    setSelected(new Set());
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.3fr_1fr]">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
          <Input type="search" placeholder="Student, roll number or company" className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option>
        </Select>
        <Select aria-label="Company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}>
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.display_name}</option>)}
        </Select>
        <Input type="date" aria-label="Placement date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
      </div>

      {selected.size ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2.5 text-sm">
          <span className="text-ink">{selected.size} selected</span>
          <Button size="sm" variant="mint" disabled={busy} onClick={() => setStatusFor([...selected], 'published')}>Publish</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatusFor([...selected], 'draft')}>Unpublish</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      {view.items.length ? (
        <Table>
          <thead>
            <tr>
              <Th className="w-10"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} className="size-4 accent-violet-500" /></Th>
              <Th>Student</Th><Th>Company and role</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {view.items.map((p) => (
              <tr key={p.placement_id} className={selected.has(p.placement_id) ? 'bg-violet/5' : undefined}>
                <Td><input type="checkbox" aria-label={`Select ${p.student_name}`} checked={selected.has(p.placement_id)} onChange={() => toggle(p.placement_id)} className="size-4 accent-violet-500" /></Td>
                <Td><p className="font-medium">{p.student_name}</p><p className="text-xs text-dim">{p.roll_number}{p.student_archived ? ', archived' : ''}</p></Td>
                <Td><p>{p.company_name}</p></Td>
                <Td className="whitespace-nowrap">{formatDate(p.placement_date)}</Td>
                <Td><StatusBadge status={p.publication_status} /></Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {p.publication_status === 'draft'
                      ? <Button size="sm" variant="mint" disabled={busy} onClick={() => setStatusFor([p.placement_id], 'published')}>Publish</Button>
                      : <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatusFor([p.placement_id], 'draft')}>Unpublish</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.student_name}'s placement`}><Pencil /></Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title={placements.length ? 'No placements match' : 'No placements yet'} body={placements.length ? 'Change the filters to see more.' : 'Record the first offer to start the celebration wall.'}
          action={<Button asChild variant="celebrate"><Link href="/admin/placements/new">Add placements</Link></Button>} />
      )}

      {view.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-mist">
          <Button size="sm" variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button>
          <span>Page {view.page} of {view.totalPages}, {filtered.length} placements</span>
          <Button size="sm" variant="outline" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button>
        </div>
      ) : <p className="text-sm text-dim">{filtered.length} of {placements.length} placements</p>}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title="Edit placement" description="Changes to published placements appear on the site within a minute." wide>
            <PlacementEditForm placement={editing} students={students} companies={companies} onDone={() => setEditing(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
