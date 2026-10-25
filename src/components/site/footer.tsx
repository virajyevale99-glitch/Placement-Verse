import Link from 'next/link';
import { Logo } from './logo';

function formatStamp(iso: string, timeZone = 'Asia/Kolkata') {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone, timeZoneName: 'short' });
  } catch {
    return new Date(iso).toISOString();
  }
}

export function Footer({ batchName, generatedAt, timeZone }: { batchName?: string; generatedAt?: string; timeZone?: string }) {
  return (
    <footer className="mt-24 border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-mist">Every offer has a story. Every student deserves the spotlight.</p>
        </div>
        <div className="text-sm text-dim md:text-right">
          {batchName ? <p>{batchName}</p> : null}
          {generatedAt ? <p>Updated {formatStamp(generatedAt, timeZone)}</p> : null}
          <p className="mt-2"><Link href="/admin/login" className="hover:text-ink">Admin login</Link></p>
        </div>
      </div>
    </footer>
  );
}
