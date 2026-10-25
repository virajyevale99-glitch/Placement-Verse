'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Logo } from './logo';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/students', label: 'Placed Students' },
  { href: '/companies', label: 'Companies' },
  { href: '/celebrations', label: 'Celebrations' },
  { href: '/insights', label: 'Insights' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-midnight/70 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
                className={cn('rounded-lg px-3 py-2 text-sm transition-colors', isActive(l.href) ? 'text-ink' : 'text-mist hover:text-ink')}
              >
                {l.label}
                {isActive(l.href) ? <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full bg-champagne" /> : null}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/admin/login" className="hidden rounded-xl border border-line px-3.5 py-2 text-sm text-mist transition-colors hover:border-violet/50 hover:text-ink sm:inline-flex">
            Admin login
          </Link>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-mist hover:bg-white/5 hover:text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open ? (
        <div id="mobile-menu" className="border-t border-white/5 bg-midnight/95 lg:hidden">
          <ul className="mx-auto grid max-w-7xl gap-1 px-4 py-3">
            {[...LINKS, { href: '/admin/login', label: 'Admin login' }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}
                  className={cn('block rounded-xl px-3 py-3 text-base', isActive(l.href) ? 'bg-white/5 text-ink' : 'text-mist')}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
