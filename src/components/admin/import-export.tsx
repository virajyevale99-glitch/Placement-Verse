'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Upload } from 'lucide-react';
import type { AdminCompany, AdminPlacement, AdminStudent, BulkResult } from '@/lib/types';
import { parseCsvObjects } from '@/lib/core/csv';
import {
  missingColumns, PLACEMENT_REQUIRED, PLACEMENT_TEMPLATE, preparePlacementRows, prepareStudentRows,
  STUDENT_REQUIRED, STUDENT_TEMPLATE, type RowIssue,
} from '@/lib/core/csv-import';
import { newRequestId, rpc } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { Card, Notice } from '@/components/ui/misc';

const MAX_FILE_BYTES = 1_000_000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportExport({ students, companies, placements, activeBatchId, defaultDepartment }: {
  students: AdminStudent[]; companies: AdminCompany[]; placements: AdminPlacement[]; activeBatchId: string; defaultDepartment: string;
}) {
  return (
    <div className="grid gap-6">
      <Importer kind="students" students={students} companies={companies} placements={placements} activeBatchId={activeBatchId} defaultDepartment={defaultDepartment} />
      <Importer kind="placements" students={students} companies={companies} placements={placements} activeBatchId={activeBatchId} defaultDepartment={defaultDepartment} />
      <Card className="p-6">
        <h2 className="font-display text-xl text-ink">Export</h2>
        <p className="mt-1 text-sm text-mist">Downloads include drafts but never internal notes. Each export is recorded in the activity log.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['students', 'placements', 'companies'] as const).map((e) => (
            <Button key={e} asChild variant="outline"><a href={`/api/admin/export?entity=${e}`}><Download /> {e[0].toUpperCase() + e.slice(1)} CSV</a></Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Importer({ kind, students, companies, placements, activeBatchId, defaultDepartment }: {
  kind: 'students' | 'placements'; students: AdminStudent[]; companies: AdminCompany[]; placements: AdminPlacement[]; activeBatchId: string; defaultDepartment: string;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; issues?: RowIssue[] } | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);

  const prepared = useMemo(() => {
    if (!rows) return null;
    if (kind === 'students') {
      const rolls = new Set(students.filter((s) => s.batch_id === activeBatchId).map((s) => s.roll_number.toLowerCase()));
      return { ...prepareStudentRows(rows, rolls, defaultDepartment), unknownCompanies: [] as string[] };
    }
    const keys = new Set(placements.map((p) => [p.student_id, p.company_id, p.job_role.toLowerCase(), p.placement_date].join('|')));
    return preparePlacementRows(rows, students.filter((s) => s.batch_id === activeBatchId), companies, keys);
  }, [rows, kind, students, companies, placements, activeBatchId, defaultDepartment]);

  const onFile = async (file: File | undefined) => {
    setResult(null);
    setFileError(null);
    setRows(null);
    setRequestId(newRequestId());
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) return setFileError('File is larger than 1 MB. Split it into smaller files.');
    try {
      const { header, rows: parsed } = parseCsvObjects(await file.text());
      const missing = missingColumns(header, kind === 'students' ? STUDENT_REQUIRED : PLACEMENT_REQUIRED);
      if (missing.length) return setFileError(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected header.`);
      if (!parsed.length) return setFileError('The file has a header but no rows.');
      if (parsed.length > 500) return setFileError(`The file has ${parsed.length} rows. Import at most 500 at a time.`);
      setRows(parsed);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read this CSV file.');
    }
  };

  const submit = async () => {
    if (!prepared?.valid.length) return;
    setBusy(true);
    const res = kind === 'students'
      ? await rpc<BulkResult<unknown>>('admin.students.bulkCreate', { rows: prepared.valid, partial }, requestId)
      : await rpc<BulkResult<unknown>>('admin.placements.bulkCreate', { items: prepared.valid, partial }, requestId);
    setBusy(false);
    if (!res.ok) {
      setResult({ tone: 'error', text: res.error.message });
      return;
    }
    setResult({ tone: res.data.failed_count ? 'error' : 'success', text: `Imported ${res.data.created_count} ${kind}.${res.data.failed_count ? ` ${res.data.failed_count} rejected by the server.` : ''}` });
    setRows(null);
    setFileName('');
    router.refresh();
  };

  const blocked = !!prepared && prepared.issues.length > 0 && !partial;
  const inputId = `csv-${kind}`;

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-xl text-ink">Import {kind}</h2>
          <p className="mt-1 max-w-xl text-sm text-mist">
            {kind === 'students'
              ? 'Columns: full_name, roll_number, department, graduation_year. Students join the active batch.'
              : 'Columns: roll_number, company, placement_date, ctc, status. Companies must already exist; dates as YYYY-MM-DD or DD/MM/YYYY; status is draft or published.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => download(`${kind}-template.csv`, kind === 'students' ? STUDENT_TEMPLATE : PLACEMENT_TEMPLATE)}><Download /> Template</Button>
      </div>
      <div className="mt-5">
        <label htmlFor={inputId} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-mist hover:border-violet/50 hover:text-ink">
          <Upload className="size-4" aria-hidden /> {fileName || 'Choose a CSV file'}
        </label>
        <input id={inputId} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {fileError ? <div className="mt-4"><Notice tone="error">{fileError}</Notice></div> : null}
      {prepared ? (
        <div className="mt-5 grid gap-4">
          <p className="text-sm text-ink">
            {prepared.valid.length} of {rows!.length} rows are ready.
            {prepared.issues.length ? <span className="text-danger"> {prepared.issues.length} need attention.</span> : null}
          </p>
          {prepared.unknownCompanies.length ? (
            <Notice tone="info">Add these companies first under Companies, then re-upload: {prepared.unknownCompanies.join(', ')}.</Notice>
          ) : null}
          {prepared.issues.length ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
              <ul className="grid gap-1.5">
                {prepared.issues.map((iss) => <li key={iss.row}><span className="font-medium text-ink">Row {iss.row}:</span> <span className="text-red-200">{iss.messages.join('; ')}</span></li>)}
              </ul>
            </div>
          ) : null}
          {prepared.issues.length ? (
            <label className="flex items-center gap-2 text-sm text-mist">
              <input type="checkbox" className="size-4 accent-violet-500" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
              Import the {prepared.valid.length} valid rows and skip the rest
            </label>
          ) : null}
          <div>
            <Button onClick={submit} disabled={busy || blocked || !prepared.valid.length}>{busy ? 'Importing…' : `Import ${prepared.valid.length} ${kind}`}</Button>
          </div>
        </div>
      ) : null}
      {result ? <div className="mt-4"><Notice tone={result.tone}>{result.text}</Notice></div> : null}
    </Card>
  );
}
