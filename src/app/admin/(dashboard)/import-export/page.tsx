import { adminRead } from '@/lib/admin-server';
import type { AdminCompany, AdminPlacement, AdminStudent, Batch } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { ImportExport } from '@/components/admin/import-export';

export const metadata = { title: 'Import & export' };

export default async function ImportExportPage() {
  const [students, companies, placements, batches, config] = await Promise.all([
    adminRead<AdminStudent[]>('admin.students.list'),
    adminRead<AdminCompany[]>('admin.companies.list'),
    adminRead<AdminPlacement[]>('admin.placements.list'),
    adminRead<Batch[]>('admin.batches.list'),
    adminRead<Record<string, string>>('admin.config.get'),
  ]);
  const active = batches.find((b) => b.batch_id === config.active_batch_id) ?? batches[0];
  return (
    <>
      <AdminHeader title="Import & export" lead="Rows are checked in your browser first, then validated again on the server. By default nothing is saved unless every row is valid." />
      <ImportExport students={students} companies={companies} placements={placements} activeBatchId={active?.batch_id ?? ''} defaultDepartment={active?.department ?? ''} />
    </>
  );
}
