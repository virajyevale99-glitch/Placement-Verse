import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="PlacementVerse home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <circle cx="32" cy="32" r="20" fill="none" stroke="#262E52" strokeWidth="6" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="#8B5CF6" strokeWidth="6" strokeDasharray="90 200" strokeLinecap="round" transform="rotate(-90 32 32)" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="#34D399" strokeWidth="6" strokeDasharray="22 200" strokeDashoffset="-96" strokeLinecap="round" transform="rotate(-90 32 32)" />
        <circle cx="32" cy="32" r="7" fill="#F6D78B" />
      </svg>
      <span className="font-display text-lg font-semibold text-ink">PlacementVerse</span>
    </Link>
  );
}
