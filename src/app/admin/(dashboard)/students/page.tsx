import { adminRead } from '@/lib/admin-server';
import type { AdminPlacement, AdminStudent, Batch } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { StudentsManager } from '@/components/admin/students-manager';

export const metadata = { title: 'Students' };

export default async function AdminStudentsPage() {
  const [students, placements, batches, config] = await Promise.all([
    adminRead<AdminStudent[]>('admin.students.list'),
    adminRead<AdminPlacement[]>('admin.placements.list'),
    adminRead<Batch[]>('admin.batches.list'),
    adminRead<Record<string, string>>('admin.config.get'),
  ]);
  const active = batches.find((b) => b.batch_id === config.active_batch_id) ?? batches[0];
  return (
    <>
      <AdminHeader title="Students" lead="New students join the active batch. Archiving hides a student and their placements from the public site without deleting anything." />
      <StudentsManager students={students} placements={placements} defaultDepartment={active?.department ?? ''} />
    </>
  );
}
