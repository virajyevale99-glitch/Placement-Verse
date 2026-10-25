import { hueFor, initials } from '@/lib/core/placements';
import { cn } from '@/lib/utils';

/** Company logo when a URL is configured, otherwise a deterministic monogram. */
export function CompanyMark({ id, name, logoUrl, size = 'md' }: { id: string; name: string; logoUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'size-8 text-xs rounded-lg', md: 'size-11 text-sm rounded-xl', lg: 'size-16 text-xl rounded-2xl' }[size];
  if (logoUrl && /^https:\/\//.test(logoUrl)) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden bg-white p-1.5', dims)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin-configured external logos; avoids a remotePatterns allowlist */}
        <img src={logoUrl} alt={`${name} logo`} className="size-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      </span>
    );
  }
  const h = hueFor(id);
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center font-display font-semibold', dims)}
      style={{ background: `hsl(${h} 55% 22%)`, color: `hsl(${h} 90% 82%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 60% 40% / 0.5)` }}
    >
      {initials(name)}
    </span>
  );
}
