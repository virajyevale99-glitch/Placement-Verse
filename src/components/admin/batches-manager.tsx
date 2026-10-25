'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { Batch } from '@/lib/types';
import { batchCreate, batchUpdate } from '@/lib/validation/schemas';
import { fieldErrors, newRequestId, rpc } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Badge, Card, Notice } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function BatchesManager({ batches, activeBatchId, placedInActive }: { batches: Batch[]; activeBatchId: string; placedInActive: number }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const active = batches.find((b) => b.batch_id === activeBatchId) ?? batches[0];

  const makeActive = async (b: Batch) => {
    const res = await rpc('admin.config.update', { values: { active_batch_id: b.batch_id } });
    setNotice(res.ok ? { tone: 'success', text: `${b.batch_name} is now the active batch shown on the site.` } : { tone: 'error', text: res.error.message });
    if (res.ok) router.refresh();
  };

  return (
    <div className="grid gap-6">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {active ? (
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="font-display text-xl text-ink">Active batch</h2>
            <Badge tone="mint">Shown on the public site</Badge>
          </div>
          <BatchForm key={active.batch_id + active.updated_at} batch={active} placed={placedInActive}
            onSaved={(t) => { setNotice({ tone: 'success', text: t }); router.refresh(); }} />
        </Card>
      ) : null}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">All batches</h2>
          <Button variant="outline" onClick={() => setCreating(true)}><Plus /> New batch</Button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {batches.map((b) => (
            <li key={b.batch_id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink">{b.batch_name}</p>
                  <p className="text-sm text-mist">{[b.academic_year, b.department, `${b.total_students} students`].filter(Boolean).join(', ')}</p>
                </div>
                {b.batch_id === active?.batch_id ? <Badge tone="mint">Active</Badge> : <Button size="sm" variant="ghost" onClick={() => makeActive(b)}>Make active</Button>}
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? (
          <DialogContent title="New batch">
            <BatchForm batch={null} placed={0} onSaved={(t) => { setCreating(false); setNotice({ tone: 'success', text: t }); router.refresh(); }} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function BatchForm({ batch, placed, onSaved }: { batch: Batch | null; placed: number; onSaved: (msg: string) => void }) {
  const [v, setV] = useState({
    batch_name: batch?.batch_name ?? '', academic_year: batch?.academic_year ?? '', department: batch?.department ?? '',
    total_students: batch?.total_students ?? '60', timezone: batch?.timezone ?? 'Asia/Kolkata', description: batch?.description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const [needsCorrection, setNeedsCorrection] = useState(false);
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const below = batch && Number(v.total_students) < placed;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const parsed = batch
      ? batchUpdate.safeParse({ ...v, batch_id: batch.batch_id, force_correction: needsCorrection || undefined, correction_reason: correction })
      : batchCreate.safeParse({ ...v, make_active: makeActive });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    if (batch && below && (!needsCorrection || correction.trim().length < 10)) {
      setNeedsCorrection(true);
      setMessage(`${placed} students in this batch are already placed. To set a smaller batch size, explain why below (at least 10 characters). This is recorded in the activity log.`);
      return;
    }
    setBusy(true);
    const res = await rpc(batch ? 'admin.batches.update' : 'admin.batches.create', parsed.data, newRequestId());
    setBusy(false);
    if (!res.ok) {
      setErrors(fieldErrors(res.error));
      setMessage(res.error.message);
      if (res.error.code === 'BATCH_BELOW_PLACED') setNeedsCorrection(true);
      return;
    }
    onSaved(batch ? 'Batch settings saved. Public numbers update within a minute.' : `Created ${v.batch_name}.`);
  };

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
      {message ? <div className="sm:col-span-2"><Notice tone="error">{message}</Notice></div> : null}
      <Field id={`bf-name-${batch?.batch_id ?? 'new'}`} label="Batch name" error={errors.batch_name}><Input value={v.batch_name} onChange={set('batch_name')} maxLength={100} /></Field>
      <Field id={`bf-year-${batch?.batch_id ?? 'new'}`} label="Academic year" error={errors.academic_year}><Input value={v.academic_year} onChange={set('academic_year')} placeholder="2025-27" maxLength={20} /></Field>
      <Field id={`bf-dept-${batch?.batch_id ?? 'new'}`} label="Department" error={errors.department}><Input value={v.department} onChange={set('department')} maxLength={80} /></Field>
      <Field id={`bf-total-${batch?.batch_id ?? 'new'}`} label="Total students (batch strength)" error={errors.total_students}
        hint={batch ? `${placed} already placed. The placement rate is calculated against this number.` : undefined}>
        <Input type="number" min={0} max={100000} value={v.total_students} onChange={set('total_students')} />
      </Field>
      <Field id={`bf-tz-${batch?.batch_id ?? 'new'}`} label="Display timezone" hint="IANA name, e.g. Asia/Kolkata. Used to group placements by day." error={errors.timezone}><Input value={v.timezone} onChange={set('timezone')} /></Field>
      <Field id={`bf-desc-${batch?.batch_id ?? 'new'}`} label="Description" error={errors.description} className="sm:col-span-2"><Textarea className="min-h-16" value={v.description} onChange={set('description')} maxLength={500} /></Field>
      {needsCorrection && batch ? (
        <Field id="bf-correction" label="Reason for the correction" error={errors.correction_reason} className="sm:col-span-2">
          <Textarea value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="e.g. Three students withdrew from the programme in September." />
        </Field>
      ) : null}
      {!batch ? (
        <label className="flex items-center gap-2 text-sm text-mist sm:col-span-2">
          <input type="checkbox" className="size-4 accent-violet-500" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Make this the active batch on the public site
        </label>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : batch ? (needsCorrection ? 'Save with correction' : 'Save batch') : 'Create batch'}</Button>
      </div>
    </form>
  );
}
