import { adminRead } from '@/lib/admin-server';
import { AdminHeader } from '@/components/admin/bits';
import { SettingsForm } from '@/components/admin/settings-form';
import { Card } from '@/components/ui/misc';
import { SESSION_TTL_SECONDS } from '@/lib/auth/session';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const config = await adminRead<Record<string, string>>('admin.config.get');
  return (
    <>
      <AdminHeader title="Settings" lead="Public display options. Secrets and passwords are never stored here or in the spreadsheet." />
      <SettingsForm config={config} />
      <Card className="mt-8 p-6 text-sm text-mist">
        <h2 className="font-display text-lg text-ink">Security</h2>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5">
          <li>Sessions last {SESSION_TTL_SECONDS / 3600} hours, then you are asked to sign in again.</li>
          <li>Both administrators share one fixed password, set as <code className="text-ink">ADMIN_PASSWORD</code> in <code className="text-ink">src/lib/auth/password.ts</code>. To change it, edit that file and redeploy.</li>
          <li>To sign everyone out, rotate ADMIN_SESSION_SECRET in Vercel and redeploy.</li>
          <li>To block an administrator immediately, set their <code className="text-ink">enabled</code> cell to FALSE in the Admins tab.</li>
        </ul>
      </Card>
    </>
  );
}
