import { Navbar } from '@/components/site/navbar';
import { Footer } from '@/components/site/footer';
import { getPublicSnapshot } from '@/lib/backend/public';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // The footer is best-effort; a backend outage is handled by each page's error boundary.
  const snap = await getPublicSnapshot().catch(() => null);
  return (
    <>
      <Navbar />
      {snap?.demo ? (
        <div className="border-b border-champagne/20 bg-champagne/10 px-4 py-2 text-center text-xs text-champagne">
          Local preview with fictional demo data. Connect Google Sheets to show real placements (see docs/SETUP.md).
        </div>
      ) : null}
      <main id="main">{children}</main>
      <Footer batchName={snap?.batch?.batch_name} generatedAt={snap?.generated_at} timeZone={snap?.config.display_timezone} />
    </>
  );
}
