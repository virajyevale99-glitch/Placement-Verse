import Link from 'next/link';
import { adminRead } from '@/lib/admin-server';
import type { AdminCompany, AdminPlacement, AdminStudent } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { PlacementsManager } from '@/components/admin/placements-manager';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Placements' };

export default async function AdminPlacementsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  const [placements, students, companies] = await Promise.all([
    adminRead<AdminPlacement[]>('admin.placements.list'),
    adminRead<AdminStudent[]>('admin.students.list'),
    adminRead<AdminCompany[]>('admin.companies.list'),
  ]);
  return (
    <>
      <AdminHeader title="Placements" lead="Every announcement is its own record. Publishing one never replaces another."
        actions={<Button asChild variant="celebrate"><Link href="/admin/placements/new">Add placements</Link></Button>} />
      <PlacementsManager placements={placements} students={students} companies={companies} initialCompanyId={companies.some((c) => c.company_id === company) ? company : ''} />
    </>
  );
}
