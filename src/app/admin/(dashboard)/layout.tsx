import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/guard';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · PlacementVerse' }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  return <AdminShell adminName={session.name} expiresAt={session.exp}>{children}</AdminShell>;
}
