import type { Metadata } from 'next';
import { getPublicSnapshot } from '@/lib/backend/public';
import { Container, PageHeader } from '@/components/site/section';
import { CelebrationWall } from '@/components/site/celebration-wall';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Celebrations',
  description: 'Every placement, grouped by the day it happened. Same-day offers are shown side by side, never hidden.',
};

export default async function CelebrationsPage() {
  const snap = await getPublicSnapshot();
  return (
    <>
      <PageHeader
        title="Every Win Deserves the Spotlight"
        lead="Offers grouped by the day they came in. When many students are placed on the same day, every one of them gets a card here."
      />
      <Container>
        <CelebrationWall initial={snap} />
      </Container>
    </>
  );
}
