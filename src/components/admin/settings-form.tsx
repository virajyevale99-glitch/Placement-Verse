'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { configUpdate } from '@/lib/validation/schemas';
import { fieldErrors, newRequestId, rpc } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Card, Notice } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';

const TOGGLES = [
  { key: 'announcements_enabled', label: 'Show the Latest wins feed on the homepage', hint: 'Placed students stay visible in the directory and celebration wall either way.' },
  { key: 'show_ctc', label: 'Show package (CTC) publicly', hint: 'Off by default. Only placements with a package entered will show one.' },
  { key: 'show_student_photos', label: 'Show student photos publicly', hint: 'Off by default. Make sure students have agreed before turning this on.' },
] as const;

export function SettingsForm({ config }: { config: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState({
    app_name: config.app_name ?? 'PlacementVerse',
    display_timezone: config.display_timezone ?? 'Asia/Kolkata',
    latest_wins_limit: config.latest_wins_limit ?? '12',
    announcements_enabled: config.announcements_enabled ?? 'true',
    show_ctc: config.show_ctc ?? 'false',
    show_student_photos: config.show_student_photos ?? 'false',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = configUpdate.safeParse({ values: v });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[1]), i.message])));
    setBusy(true);
    const res = await rpc('admin.config.update', parsed.data, newRequestId());
    setBusy(false);
    if (!res.ok) {
      setErrors(fieldErrors(res.error));
      setNotice({ tone: 'error', text: res.error.message });
      return;
    }
    setErrors({});
    setNotice({ tone: 'success', text: 'Settings saved. The public site updates within a minute.' });
    router.refresh();
  };

  return (
    <form onSubmit={save} className="grid gap-6" noValidate>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card className="grid gap-4 p-6 sm:grid-cols-3">
        <Field id="set-name" label="Site name" error={errors.app_name}><Input value={v.app_name} onChange={(e) => setV({ ...v, app_name: e.target.value })} maxLength={60} /></Field>
        <Field id="set-tz" label="Display timezone" error={errors.display_timezone}><Input value={v.display_timezone} onChange={(e) => setV({ ...v, display_timezone: e.target.value })} /></Field>
        <Field id="set-limit" label="Latest wins on homepage" hint="3 to 48 cards" error={errors.latest_wins_limit}><Input type="number" min={3} max={48} value={v.latest_wins_limit} onChange={(e) => setV({ ...v, latest_wins_limit: e.target.value })} /></Field>
      </Card>
      <Card className="divide-y divide-line">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-6 p-5">
            <div>
              <label htmlFor={`set-${t.key}`} className="font-medium text-ink">{t.label}</label>
              <p className="mt-0.5 text-sm text-mist">{t.hint}</p>
            </div>
            <Switch id={`set-${t.key}`} checked={v[t.key] === 'true'} onCheckedChange={(on) => setV({ ...v, [t.key]: on ? 'true' : 'false' })} />
          </div>
        ))}
      </Card>
      <div><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button></div>
    </form>
  );
}
