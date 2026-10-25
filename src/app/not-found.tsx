import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-32 text-center">
      <h1 className="font-display text-4xl text-ink">Page not found</h1>
      <p className="mt-3 text-mist">This page doesn&apos;t exist, or the announcement isn&apos;t published.</p>
      <Button asChild className="mt-8" variant="celebrate"><Link href="/">Go to the homepage</Link></Button>
    </main>
  );
}
