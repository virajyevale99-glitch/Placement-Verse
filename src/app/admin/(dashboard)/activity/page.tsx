import { adminRead } from '@/lib/admin-server';
import type { AuditLog } from '@/lib/types';
import { AdminHeader, formatStamp, Table, Td, Th } from '@/components/admin/bits';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'Activity' };

export default async function ActivityPage() {
  const { items, total } = await adminRead<{ items: AuditLog[]; total: number }>('admin.audit.list', { limit: 500 });
  return (
    <>
      <AdminHeader title="Activity" lead={`Private audit trail of every change. Showing the latest ${Math.min(500, total)} of ${total}. The full log is in the AuditLogs tab of the spreadsheet.`} />
      {items.length ? (
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th><Th>Details</Th></tr></thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.log_id}>
                <Td className="whitespace-nowrap text-mist">{formatStamp(l.created_at)}</Td>
                <Td className="whitespace-nowrap">{l.actor_name}</Td>
                <Td className="whitespace-nowrap">{l.action.replace(/[._]/g, ' ')}</Td>
                <Td className="whitespace-nowrap text-xs text-dim">{l.entity_type} {l.entity_id}</Td>
                <Td className="max-w-md text-mist">{l.change_summary}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="No activity yet" body="Every create, edit, publish and export is recorded here." />}
    </>
  );
}
