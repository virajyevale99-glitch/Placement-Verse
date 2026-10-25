'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import type { AdminCompany } from '@/lib/types';
import { companyInput } from '@/lib/validation/schemas';
import { fieldErrors, newRequestId, rpc } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { EmptyState, Notice } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CompanyMark } from '@/components/site/company-mark';
import { Table, Td, Th } from './bits';

export function CompaniesManager({ companies }: { companies: AdminCompany[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminCompany | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sorted = [...companies].sort((a, b) => a.display_name.localeCompare(b.display_name));
  return (
    <div className="grid gap-4">
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> Add company</Button></div>
      {sorted.length ? (
        <Table>
          <thead><tr><Th>Company</Th><Th>Website</Th><Th>Placements</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.company_id}>
                <Td><span className="flex items-center gap-3"><CompanyMark id={c.company_id} name={c.display_name} logoUrl={c.logo_url} size="sm" /><span className="font-medium">{c.display_name}</span></span></Td>
                <Td className="max-w-[16rem] truncate text-mist">{c.website_url ? c.website_url.replace(/^https:\/\//, '') : '—'}</Td>
                <Td>{c.published_count} published{c.placement_count > c.published_count ? <span className="text-dim">, {c.placement_count - c.published_count} draft</span> : null}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.placement_count ? <Button asChild size="sm" variant="ghost"><Link href={`/admin/placements?company=${c.company_id}`}>Placements</Link></Button> : null}
                    {c.published_count ? <Button asChild size="sm" variant="ghost"><Link href={`/companies/${c.company_id}`} target="_blank">Public page</Link></Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.display_name}`}><Pencil /></Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="No companies yet" body="Add recruiters here, or create them while adding placements." />}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing === 'new' ? 'Add company' : 'Edit company'} description="Names are matched ignoring case and suffixes like Pvt Ltd, so duplicates are caught.">
            <CompanyForm company={editing === 'new' ? null : editing} onDone={(msg) => { setEditing(null); if (msg) { setNotice(msg); router.refresh(); } }} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function CompanyForm({ company, onDone }: { company: AdminCompany | null; onDone: (msg?: string) => void }) {
  const [v, setV] = useState({ display_name: company?.display_name ?? '', logo_url: company?.logo_url ?? '', website_url: company?.website_url ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = companyInput.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setBusy(true);
    const res = company
      ? await rpc('admin.companies.update', { company_id: company.company_id, ...parsed.data }, requestId)
      : await rpc('admin.companies.create', parsed.data, requestId);
    setBusy(false);
    if (!res.ok) {
      const fe = fieldErrors(res.error);
      setErrors(Object.keys(fe).length ? fe : { display_name: res.error.message });
      if (res.error.code === 'DUPLICATE') setErrors({ display_name: res.error.message });
      return;
    }
    onDone(`${company ? 'Saved' : 'Added'} ${parsed.data.display_name}.`);
  };
  return (
    <form onSubmit={save} className="grid gap-4" noValidate>
      <Field id="cf-name" label="Company name" error={errors.display_name}><Input value={v.display_name} onChange={set('display_name')} maxLength={100} autoFocus /></Field>
      <Field id="cf-logo" label="Logo URL (optional)" hint="https:// link to a square image. Without one, a monogram is shown." error={errors.logo_url}><Input value={v.logo_url} onChange={set('logo_url')} /></Field>
      <Field id="cf-web" label="Website (optional)" error={errors.website_url}><Input value={v.website_url} onChange={set('website_url')} placeholder="https://" /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : company ? 'Save changes' : 'Add company'}</Button>
      </div>
    </form>
  );
}
