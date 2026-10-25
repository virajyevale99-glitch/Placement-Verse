'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCompany, AdminPlacement, AdminStudent, PublicPlacement } from '@/lib/types';
import { placementUpdate } from '@/lib/validation/schemas';
import { fieldErrors, newRequestId, rpc } from '@/lib/admin-client';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { PlacementTicket } from '@/components/site/placement-ticket';

type Values = {
  student_id: string; company_id: string; job_role: string; placement_date: string; ctc: string; currency: string;
  announcement_title: string; announcement_message: string; publication_status: 'draft' | 'published'; internal_notes: string;
};

/** Edits one placement, with a live preview of the public card. */
export function PlacementEditForm({ placement, students, companies, onDone }: {
  placement: AdminPlacement; students: AdminStudent[]; companies: AdminCompany[]; onDone: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<Values>({
    student_id: placement.student_id, company_id: placement.company_id, job_role: placement.job_role,
    placement_date: placement.placement_date, ctc: placement.ctc, currency: placement.currency || 'INR',
    announcement_title: placement.announcement_title, announcement_message: placement.announcement_message,
    publication_status: placement.publication_status, internal_notes: placement.internal_notes,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(newRequestId);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const student = students.find((s) => s.student_id === v.student_id);
  const company = companies.find((c) => c.company_id === v.company_id);
  const preview: PublicPlacement = {
    placement_id: placement.placement_id, student_id: v.student_id, student_name: student?.full_name ?? 'Student',
    department: student?.department ?? '', company_id: v.company_id, company_name: company?.display_name ?? 'Company',
    company_logo_url: company?.logo_url ?? '', job_role: v.job_role, placement_date: v.placement_date || '—',
    published_at: '', announcement_title: v.announcement_title, announcement_message: v.announcement_message,
    ...(v.ctc ? { ctc: Number(v.ctc), currency: v.currency } : {}),
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const parsed = placementUpdate.safeParse({ placement_id: placement.placement_id, ...v });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    const res = await rpc('admin.placements.update', parsed.data, requestId);
    setSaving(false);
    if (!res.ok) {
      setErrors(fieldErrors(res.error));
      setMessage(res.error.message);
      return;
    }
    router.refresh();
    onDone();
  };

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_18rem]" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {message ? <div className="sm:col-span-2"><Notice tone="error">{message}</Notice></div> : null}
        <Field id="pf-student" label="Student" error={errors.student_id} className="sm:col-span-2">
          <Select value={v.student_id} onChange={set('student_id')}>
            {students.filter((s) => !s.archived_at || s.student_id === v.student_id).map((s) => <option key={s.student_id} value={s.student_id}>{s.full_name} ({s.roll_number})</option>)}
          </Select>
        </Field>
        <Field id="pf-company" label="Company" error={errors.company_id}>
          <Select value={v.company_id} onChange={set('company_id')}>
            {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.display_name}</option>)}
          </Select>
        </Field>
        <Field id="pf-date" label="Placement date" error={errors.placement_date}><Input type="date" value={v.placement_date} onChange={set('placement_date')} required /></Field>
        <Field id="pf-status" label="Status" error={errors.publication_status}>
          <Select value={v.publication_status} onChange={set('publication_status')}>
            <option value="draft">Draft (private)</option>
            <option value="published">Published</option>
          </Select>
        </Field>
        <Field id="pf-ctc" label="Package (optional)" hint="Annual CTC. Shown publicly only if enabled in Settings." error={errors.ctc}>
          <Input inputMode="numeric" value={v.ctc} onChange={set('ctc')} placeholder="e.g. 1800000" />
        </Field>
        <Field id="pf-currency" label="Currency" error={errors.currency}><Input value={v.currency} onChange={set('currency')} maxLength={3} /></Field>
        <Field id="pf-title" label="Announcement title" className="sm:col-span-2" error={errors.announcement_title}><Input value={v.announcement_title} onChange={set('announcement_title')} maxLength={140} /></Field>
        <Field id="pf-msg" label="Announcement message (optional)" className="sm:col-span-2" error={errors.announcement_message}><Textarea value={v.announcement_message} onChange={set('announcement_message')} maxLength={1000} /></Field>
        <Field id="pf-notes" label="Internal notes" hint="Private. Never shown on the public site." className="sm:col-span-2" error={errors.internal_notes}><Textarea value={v.internal_notes} onChange={set('internal_notes')} maxLength={1000} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-mist">Public preview</p>
        <PlacementTicket p={preview} />
        {v.publication_status === 'draft' ? <p className="mt-2 text-xs text-dim">Drafts are not visible on the public site.</p> : null}
      </div>
    </form>
  );
}
