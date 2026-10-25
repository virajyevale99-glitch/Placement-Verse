'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { AdminCompany, AdminPlacement, AdminStudent, BulkResult, PublicPlacement } from '@/lib/types';
import { bulkPlacements, companyInput } from '@/lib/validation/schemas';
import { newRequestId, rpc } from '@/lib/admin-client';
import { formatDate, todayIn } from '@/lib/core/placements';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, Notice } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PlacementTicket } from '@/components/site/placement-ticket';

interface Group {
  key: string;
  company_id: string;
  job_role: string;
  ctc: string;
  students: string[];
}

const blankGroup = (): Group => ({ key: newRequestId(), company_id: '', job_role: '', ctc: '', students: [] });

/**
 * Bulk entry: one date, any number of company/role groups, each with any number of students.
 * Produces one independent placement record per (student, group). Nothing is overwritten.
 */
export function BulkPlacements({ students, companies: initialCompanies, existing, timeZone }: {
  students: AdminStudent[]; companies: AdminCompany[]; existing: AdminPlacement[]; timeZone: string;
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);
  const [date, setDate] = useState(todayIn(timeZone));
  const [groups, setGroups] = useState<Group[]>([blankGroup()]);
  const [message, setMessage] = useState('');
  const [partial, setPartial] = useState(false);
  const [step, setStep] = useState<'edit' | 'preview' | 'done'>('edit');
  const [requestId, setRequestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ index: number; text: string }[]>([]);
  const [result, setResult] = useState<{ created: number; published: boolean } | null>(null);
  const [newCompanyFor, setNewCompanyFor] = useState<string | null>(null);

  const active = useMemo(() => students.filter((s) => !s.archived_at), [students]);
  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);
  const companyById = useMemo(() => new Map(companies.map((c) => [c.company_id, c])), [companies]);
  const existingKeys = useMemo(
    () => new Set(existing.map((p) => [p.student_id, p.company_id, p.job_role.toLowerCase(), p.placement_date].join('|'))),
    [existing],
  );

  const items = groups.flatMap((g) =>
    g.students.map((sid) => ({
      student_id: sid, company_id: g.company_id, job_role: g.job_role.trim(), placement_date: date, ctc: g.ctc.trim(),
      currency: 'INR', announcement_title: '', announcement_message: message.trim(), internal_notes: '', publication_status: 'draft' as const,
    })),
  );
  const keyOf = (i: (typeof items)[number]) => [i.student_id, i.company_id, i.job_role.toLowerCase(), i.placement_date].join('|');
  const seen = new Set<string>();
  const problems = items.map((i) => {
    if (!i.company_id) return 'Choose a company';
    const k = keyOf(i);
    if (existingKeys.has(k)) return 'Already recorded';
    if (seen.has(k)) return 'Listed twice';
    seen.add(k);
    return '';
  });
  const uniqueStudents = new Set(items.map((i) => i.student_id)).size;
  const update = (key: string, patch: Partial<Group>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  const submit = async (publish: boolean) => {
    setError(null);
    setFailures([]);
    const payload = { items: items.map((i) => ({ ...i, publication_status: publish ? 'published' : 'draft' })), partial };
    const parsed = bulkPlacements.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Some entries are invalid.');
      return;
    }
    setSaving(true);
    const res = await rpc<BulkResult<AdminPlacement>>('admin.placements.bulkCreate', parsed.data, requestId);
    setSaving(false);
    const describe = (f: { index: number; errors?: { field: string; message: string }[] }) => {
      const s = byId.get(items[f.index]?.student_id ?? '');
      return { index: f.index, text: `${s?.full_name ?? `Row ${f.index + 1}`}: ${(f.errors ?? []).map((e) => `${e.field} ${e.message}`).join('; ')}` };
    };
    if (!res.ok) {
      setError(res.error.retryable ? `${res.error.message} Nothing was lost: retrying uses the same request and won't create duplicates.` : res.error.message);
      setFailures(res.error.details.filter((d) => typeof d.index === 'number').map((d) => describe(d as { index: number; errors?: { field: string; message: string }[] })));
      return;
    }
    setFailures(res.data.failed.map(describe));
    // A replayed request reports what was actually saved the first time, not what was clicked now.
    setResult({ created: res.data.created_count, published: res.data.created.length ? res.data.created[0].publication_status === 'published' : publish });
    setStep('done');
    router.refresh();
  };

  const reset = () => {
    setGroups([blankGroup()]);
    setMessage('');
    setStep('edit');
    setResult(null);
    setFailures([]);
    setRequestId(newRequestId());
  };

  if (step === 'done' && result) {
    return (
      <Card className="p-6">
        <h2 className="font-display text-2xl text-ink">{result.created} {result.created === 1 ? 'placement' : 'placements'} {result.published ? 'published' : 'saved as drafts'}</h2>
        <p className="mt-2 text-sm text-mist">Each one is a separate record. {result.published ? 'They appear on the celebration wall within a minute.' : 'Publish them from the Placements list when ready.'}</p>
        {failures.length ? (
          <div className="mt-4"><Notice tone="error"><p className="font-medium">{failures.length} not saved:</p><ul className="mt-1 list-disc pl-5">{failures.map((f) => <li key={f.index}>{f.text}</li>)}</ul></Notice></div>
        ) : null}
        <div className="mt-6 flex gap-2">
          <Button onClick={reset} variant="celebrate">Add more placements</Button>
          <Button asChild variant="outline"><Link href="/admin/placements">Go to placements</Link></Button>
        </div>
      </Card>
    );
  }

  if (step === 'preview') {
    const previews: PublicPlacement[] = items.map((i, idx) => {
      const s = byId.get(i.student_id);
      const c = companyById.get(i.company_id);
      return {
        placement_id: `preview-${idx}`, student_id: i.student_id, student_name: s?.full_name ?? '', department: s?.department ?? '',
        company_id: i.company_id, company_name: c?.display_name ?? '', company_logo_url: c?.logo_url ?? '', job_role: i.job_role,
        placement_date: date, published_at: '', announcement_title: '', announcement_message: i.announcement_message,
      };
    });
    const blocking = problems.filter(Boolean).length;
    return (
      <div className="grid gap-6">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl text-ink">Preview: {items.length} announcements for {uniqueStudents} students</h2>
            <p className="text-sm text-mist">{formatDate(date)}, across {new Set(items.map((i) => i.company_id)).size} {new Set(items.map((i) => i.company_id)).size === 1 ? 'company' : 'companies'}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep('edit')} disabled={saving}>Back to edit</Button>
            <Button variant="outline" onClick={() => submit(false)} disabled={saving || (!partial && blocking > 0)}>Save {items.length} as drafts</Button>
            <Button variant="celebrate" onClick={() => submit(true)} disabled={saving || (!partial && blocking > 0)}>{saving ? 'Saving…' : `Publish ${items.length}`}</Button>
          </div>
        </Card>
        {blocking ? <Notice tone="error">{blocking} {blocking === 1 ? 'entry has' : 'entries have'} a problem (marked below). Fix {blocking === 1 ? 'it' : 'them'}, or tick &ldquo;save the valid ones&rdquo; to skip {blocking === 1 ? 'it' : 'them'}.</Notice> : null}
        {error ? <Notice tone="error">{error}{failures.length ? <ul className="mt-1 list-disc pl-5">{failures.map((f) => <li key={f.index}>{f.text}</li>)}</ul> : null}</Notice> : null}
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" className="size-4 accent-violet-500" checked={partial} onChange={(e) => { setPartial(e.target.checked); setRequestId(newRequestId()); }} />
          If some entries fail, save the valid ones anyway (otherwise nothing is saved until all are valid)
        </label>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {previews.map((p, idx) => (
            <li key={p.placement_id}>
              <PlacementTicket p={p} className="h-full" />
              {problems[idx] ? <p className="mt-1.5 text-xs text-danger">{problems[idx]}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4 p-5 sm:grid-cols-[14rem_1fr]">
        <Field id="bulk-date" label="Placement date" hint={`Calendar date in ${timeZone}.`}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field id="bulk-message" label="Message for all announcements (optional)">
          <Textarea className="min-h-10" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Congratulations from the placement committee!" />
        </Field>
      </Card>

      {groups.map((g, gi) => (
        <GroupEditor key={g.key} index={gi} group={g} students={active} companies={companies}
          canRemove={groups.length > 1} onChange={(patch) => update(g.key, patch)} onRemove={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}
          onNewCompany={() => setNewCompanyFor(g.key)} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setGroups((gs) => [...gs, blankGroup()])}><Plus /> Add another company or role</Button>
        <div className="flex items-center gap-3">
          <p className="text-sm text-mist">{items.length} {items.length === 1 ? 'announcement' : 'announcements'}, {uniqueStudents} {uniqueStudents === 1 ? 'student' : 'students'}</p>
          <Button variant="celebrate" disabled={!items.length || !date} onClick={() => { setRequestId(newRequestId()); setStep('preview'); }}>Preview {items.length || ''}</Button>
        </div>
      </div>

      <Dialog open={!!newCompanyFor} onOpenChange={(o) => !o && setNewCompanyFor(null)}>
        {newCompanyFor ? (
          <DialogContent title="New company" description="Names are checked so the same company isn't added twice.">
            <QuickCompany onCreated={(c) => { setCompanies((cs) => [...cs, c]); update(newCompanyFor, { company_id: c.company_id }); setNewCompanyFor(null); }} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function GroupEditor({ index, group, students, companies, canRemove, onChange, onRemove, onNewCompany }: {
  index: number; group: Group; students: AdminStudent[]; companies: AdminCompany[]; canRemove: boolean;
  onChange: (p: Partial<Group>) => void; onRemove: () => void; onNewCompany: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = students.filter((s) => !needle || s.full_name.toLowerCase().includes(needle) || s.roll_number.toLowerCase().includes(needle));
  const chosen = new Set(group.students);
  const toggle = (id: string) => onChange({ students: chosen.has(id) ? group.students.filter((x) => x !== id) : [...group.students, id] });
  const allShown = shown.length > 0 && shown.every((s) => chosen.has(s.student_id));

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">Group {index + 1}</h2>
        {canRemove ? <Button variant="ghost" size="sm" onClick={onRemove}><Trash2 /> Remove group</Button> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1.2fr_1fr]">
        <Field id={`g-${group.key}-company`} label="Company">
          <div className="flex gap-2">
            <Select value={group.company_id} onChange={(e) => onChange({ company_id: e.target.value })} className="flex-1">
              <option value="">Choose a company</option>
              {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.display_name}</option>)}
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={onNewCompany} aria-label="Add a new company"><Plus /></Button>
          </div>
        </Field>
        <Field id={`g-${group.key}-ctc`} label="Package (optional)"><Input inputMode="numeric" value={group.ctc} onChange={(e) => onChange({ ctc: e.target.value })} placeholder="Annual CTC" /></Field>
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-sm text-mist">
          <span><strong className="text-ink">{group.students.length}</strong> students selected</span>
          <button type="button" className="text-violet-300 hover:text-violet-200" onClick={() => onChange({ students: allShown ? group.students.filter((id) => !shown.some((s) => s.student_id === id)) : [...new Set([...group.students, ...shown.map((s) => s.student_id)])] })}>
            {allShown ? 'Clear shown' : `Select all shown (${shown.length})`}
          </button>
        </legend>
        <label className="relative mb-2 block">
          <span className="sr-only">Find students</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
          <Input type="search" className="pl-9" placeholder="Find by name or roll number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <li key={s.student_id}>
              <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${chosen.has(s.student_id) ? 'bg-violet/15 text-ink' : 'text-mist hover:bg-white/5'}`}>
                <input type="checkbox" className="size-4 accent-violet-500" checked={chosen.has(s.student_id)} onChange={() => toggle(s.student_id)} />
                <span className="min-w-0 flex-1 truncate">{s.full_name} <span className="text-dim">({s.roll_number})</span></span>
                {s.published_count ? <Badge tone="mint">placed</Badge> : null}
              </label>
            </li>
          ))}
          {!shown.length ? <li className="p-3 text-sm text-dim">No students match.</li> : null}
        </ul>
      </fieldset>
    </Card>
  );
}

function QuickCompany({ onCreated }: { onCreated: (c: AdminCompany) => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = companyInput.safeParse({ display_name: name });
    if (!parsed.success) return setErr(parsed.error.issues[0].message);
    setBusy(true);
    const res = await rpc<AdminCompany>('admin.companies.create', parsed.data, requestId);
    setBusy(false);
    if (!res.ok) return setErr(res.error.message);
    onCreated({ ...res.data, placement_count: 0, published_count: 0 });
  };
  return (
    <form onSubmit={save} className="grid gap-4">
      <Field id="qc-name" label="Company name" error={err ?? undefined}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} /></Field>
      <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add company'}</Button>
    </form>
  );
}
