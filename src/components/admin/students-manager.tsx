'use client';
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Pencil, Plus, Search } from 'lucide-react';
import type { AdminPlacement, AdminStudent } from '@/lib/types';
import { studentInput } from '@/lib/validation/schemas';
import { fieldErrors, newRequestId, rpc } from '@/lib/admin-client';
import { formatDate, paginate } from '@/lib/core/placements';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge, Table, Td, Th } from './bits';

type Filter = 'active' | 'placed' | 'unplaced' | 'archived' | 'all';

export function StudentsManager({ students, placements, defaultDepartment }: { students: AdminStudent[]; placements: AdminPlacement[]; defaultDepartment: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminStudent | 'new' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const history = useMemo(() => {
    const m = new Map<string, AdminPlacement[]>();
    placements.forEach((p) => m.set(p.student_id, [...(m.get(p.student_id) ?? []), p]));
    return m;
  }, [placements]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return students
      .filter((s) => {
        if (filter === 'archived' && !s.archived_at) return false;
        if (filter !== 'archived' && filter !== 'all' && s.archived_at) return false;
        if (filter === 'placed' && !s.published_count) return false;
        if (filter === 'unplaced' && s.published_count) return false;
        return !n || s.full_name.toLowerCase().includes(n) || s.roll_number.toLowerCase().includes(n);
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [students, q, filter]);
  const view = paginate(filtered, page, 50);

  const archive = async (s: AdminStudent, to: boolean) => {
    if (to && s.published_count && !window.confirm(`${s.full_name} has published placements. Archiving hides them from the public site and the placed count. Continue?`)) return;
    const res = await rpc(to ? 'admin.students.archive' : 'admin.students.unarchive', { student_id: s.student_id });
    setNotice(res.ok ? { tone: 'success', text: `${s.full_name} ${to ? 'archived' : 'restored'}.` } : { tone: 'error', text: res.error.message });
    if (res.ok) router.refresh();
  };

  return (
    <div className="grid gap-4">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
          <Input type="search" className="pl-9" placeholder="Name or roll number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </label>
        <Select aria-label="Filter" className="sm:w-48" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(1); }}>
          <option value="active">Active students</option>
          <option value="placed">Placed</option>
          <option value="unplaced">Not placed yet</option>
          <option value="archived">Archived</option>
          <option value="all">Everyone</option>
        </Select>
        <Button onClick={() => setEditing('new')}><Plus /> Add student</Button>
      </div>

      {view.items.length ? (
        <Table>
          <thead><tr><Th>Name</Th><Th>Roll number</Th><Th>Department</Th><Th>Placements</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {view.items.map((s) => {
              const h = history.get(s.student_id) ?? [];
              return (
                <Fragment key={s.student_id}>
                  <tr>
                    <Td>
                      <span className="font-medium">{s.full_name}</span>
                      {s.archived_at ? <Badge className="ml-2">Archived</Badge> : null}
                    </Td>
                    <Td className="text-mist">{s.roll_number}</Td>
                    <Td className="text-mist">{s.department}</Td>
                    <Td>
                      {h.length ? (
                        <button type="button" className="inline-flex items-center gap-1 text-sm text-ink hover:text-champagne" aria-expanded={open === s.student_id} onClick={() => setOpen(open === s.student_id ? null : s.student_id)}>
                          {s.published_count} published{h.length > s.published_count ? `, ${h.length - s.published_count} draft` : ''}
                          <ChevronDown className={`size-4 transition-transform ${open === s.student_id ? 'rotate-180' : ''}`} />
                        </button>
                      ) : <span className="text-dim">None yet</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.full_name}`}><Pencil /></Button>
                        <Button size="sm" variant="ghost" onClick={() => archive(s, !s.archived_at)}>{s.archived_at ? 'Restore' : 'Archive'}</Button>
                      </div>
                    </Td>
                  </tr>
                  {open === s.student_id ? (
                    <tr>
                      <td colSpan={5} className="border-b border-line/60 bg-midnight/40 px-4 py-3">
                        <ul className="grid gap-2 text-sm">
                          {h.map((p) => (
                            <li key={p.placement_id} className="flex flex-wrap items-center gap-3">
                              <StatusBadge status={p.publication_status} />
                              <span className="text-ink">{p.company_name}</span>
                              <span className="text-dim">{formatDate(p.placement_date)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title={students.length ? 'No students match' : 'No students yet'} body={students.length ? 'Try another search or filter.' : 'Add students one by one, or import a CSV under Import & export.'} />
      )}
      {view.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-mist">
          <Button size="sm" variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button>
          <span>Page {view.page} of {view.totalPages}</span>
          <Button size="sm" variant="outline" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button>
        </div>
      ) : <p className="text-sm text-dim">{filtered.length} students</p>}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing === 'new' ? 'Add student' : 'Edit student'}>
            <StudentForm student={editing === 'new' ? null : editing} defaultDepartment={defaultDepartment}
              onDone={(text) => { setEditing(null); if (text) { setNotice({ tone: 'success', text }); router.refresh(); } }} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function StudentForm({ student, defaultDepartment, onDone }: { student: AdminStudent | null; defaultDepartment: string; onDone: (msg?: string) => void }) {
  const [v, setV] = useState({
    full_name: student?.full_name ?? '', roll_number: student?.roll_number ?? '', department: student?.department ?? defaultDepartment,
    graduation_year: student?.graduation_year ?? '', photo_url: student?.photo_url ?? '', internal_notes: student?.internal_notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = studentInput.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setBusy(true);
    const res = student
      ? await rpc('admin.students.update', { student_id: student.student_id, ...parsed.data }, requestId)
      : await rpc('admin.students.create', parsed.data, requestId);
    setBusy(false);
    if (!res.ok) {
      setErrors(fieldErrors(res.error));
      setMessage(res.error.message);
      return;
    }
    onDone(student ? `Saved ${parsed.data.full_name}.` : `Added ${parsed.data.full_name}.`);
  };

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
      {message ? <div className="sm:col-span-2"><Notice tone="error">{message}</Notice></div> : null}
      <Field id="sf-name" label="Full name" error={errors.full_name} className="sm:col-span-2"><Input value={v.full_name} onChange={set('full_name')} maxLength={100} autoFocus /></Field>
      <Field id="sf-roll" label="Roll number" error={errors.roll_number}><Input value={v.roll_number} onChange={set('roll_number')} maxLength={40} /></Field>
      <Field id="sf-year" label="Graduation year" error={errors.graduation_year}><Input inputMode="numeric" value={v.graduation_year} onChange={set('graduation_year')} maxLength={4} /></Field>
      <Field id="sf-dept" label="Department" error={errors.department} className="sm:col-span-2"><Input value={v.department} onChange={set('department')} maxLength={80} /></Field>
      <Field id="sf-photo" label="Photo URL (optional)" hint="https:// only. Shown publicly only if photos are enabled in Settings." error={errors.photo_url} className="sm:col-span-2"><Input value={v.photo_url} onChange={set('photo_url')} /></Field>
      <Field id="sf-notes" label="Internal notes" hint="Private. Never shown publicly." error={errors.internal_notes} className="sm:col-span-2"><Textarea value={v.internal_notes} onChange={set('internal_notes')} maxLength={1000} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : student ? 'Save changes' : 'Add student'}</Button>
      </div>
    </form>
  );
}
