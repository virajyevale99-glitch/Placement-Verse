import type { Metadata } from 'next';
import { getPublicSnapshot } from '@/lib/backend/public';
import { PageHeader, Container } from '@/components/site/section';
import { DirectoryBrowser } from '@/components/site/directory-browser';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Placed students', description: 'Every placed student in the batch, searchable by name, company and date.' };

export default async function StudentsPage() {
  const snap = await getPublicSnapshot();
  return (
    <>
      <PageHeader
        title="Placed students"
        lead={`All ${snap.stats.placed_students} placed ${snap.stats.placed_students === 1 ? 'student' : 'students'}, in one searchable list. Nobody drops off this page.`}
      />
      <Container>
        <DirectoryBrowser placements={snap.placements} companies={snap.companies.map((c) => ({ id: c.company_id, name: c.display_name }))} />
      </Container>
    </>
  );
}
