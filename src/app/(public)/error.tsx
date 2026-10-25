'use client';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/site/section';

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="max-w-xl py-24 text-center">
      <h1 className="font-display text-3xl text-ink">Placement data is unavailable</h1>
      <p className="mt-3 text-mist">The data service didn&apos;t respond. This is usually brief. Try again in a moment.</p>
      <Button className="mt-8" onClick={reset}>Try again</Button>
    </Container>
  );
}
