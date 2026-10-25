'use client';
import { Button } from '@/components/ui/button';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="font-display text-2xl text-ink">Couldn&apos;t load this page</h1>
      <p className="mt-3 text-sm text-mist">
        {/misconfigured|not configured|Anyone/i.test(error.message)
          ? error.message
          : 'The spreadsheet service did not respond. Wait a few seconds and retry.'}
      </p>
      <Button className="mt-8" onClick={reset}>Retry</Button>
    </div>
  );
}
