import { adminRead } from '@/lib/admin-server';
import type { AdminCompany, AdminPlacement, AdminStudent, Batch } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { BulkPlacements } from '@/components/admin/bulk-placements';

export const metadata = { title: 'Add placements' };

export default async function NewPlacementsPage() {
  const [students, companies, placements, batches, config] = await Promise.all([
    adminRead<AdminStudent[]>('admin.students.list'),
    adminRead<AdminCompany[]>('admin.companies.list'),
    adminRead<AdminPlacement[]>('admin.placements.list'),
    adminRead<Batch[]>('admin.batches.list'),
    adminRead<Record<string, string>>('admin.config.get'),
  ]);
  const active = batches.find((b) => b.batch_id === config.active_batch_id) ?? batches[0];
  const timeZone = active?.timezone || config.display_timezone || 'Asia/Kolkata';
  return (
    <>
      <AdminHeader title="Add placements" lead="Pick a date, then add one group per company and role. Select as many students as you need: each gets their own announcement." />
      <BulkPlacements students={students.filter((s) => !active || s.batch_id === active.batch_id)} companies={companies} existing={placements} timeZone={timeZone} />
    </>
  );
}
