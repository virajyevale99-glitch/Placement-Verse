import { adminRead } from '@/lib/admin-server';
import type { AdminOverview, Batch } from '@/lib/types';
import { AdminHeader } from '@/components/admin/bits';
import { BatchesManager } from '@/components/admin/batches-manager';

export const metadata = { title: 'Batches' };

export default async function AdminBatchesPage() {
  const [batches, config, overview] = await Promise.all([
    adminRead<Batch[]>('admin.batches.list'),
    adminRead<Record<string, string>>('admin.config.get'),
    adminRead<AdminOverview>('admin.overview'),
  ]);
  return (
    <>
      <AdminHeader title="Batches" lead="Batch strength is the denominator for every public statistic." />
      <BatchesManager batches={batches} activeBatchId={config.active_batch_id} placedInActive={overview.stats.placed_students} />
    </>
  );
}
