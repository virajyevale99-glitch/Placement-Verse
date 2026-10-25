import { adminRead } from '@/lib/admin-server';
import type { AdminCompany } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { CompaniesManager } from '@/components/admin/companies-manager';

export const metadata = { title: 'Companies' };

export default async function AdminCompaniesPage() {
  const companies = await adminRead<AdminCompany[]>('admin.companies.list');
  return (
    <>
      <AdminHeader title="Companies" lead="Recruiters and their logos. Filter the Placements list by company to see every related placement." />
      <CompaniesManager companies={companies} />
    </>
  );
}
