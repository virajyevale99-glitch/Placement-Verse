'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, CalendarRange, FileSpreadsheet, LayoutDashboard, LogOut, Menu, Settings, Trophy, Users, X } from 'lucide-react';
import { Logo } from '@/components/site/logo';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/placements', label: 'Placements', icon: Trophy },
  { href: '/admin/students', label: 'Students', icon: Users },
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/batches', label: 'Batches', icon: CalendarRange },
  { href: '/admin/import-export', label: 'Import & export', icon: FileSpreadsheet },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminShell({ adminName, expiresAt, children }: { adminName: string; expiresAt: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  // Session expiry: send the admin to sign-in when the signed cookie lapses, instead of failing on the next save.
  useEffect(() => {
    const ms = expiresAt * 1000 - Date.now();
    const id = window.setTimeout(() => window.location.assign('/admin/login?expired=1'), Math.max(0, ms));
    return () => window.clearTimeout(id);
  }, [expiresAt]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/admin/login');
  };

  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Admin" className="grid gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
          className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors', active(href) ? 'bg-white/[0.07] text-ink' : 'text-mist hover:bg-white/[0.04] hover:text-ink')}>
          <Icon className={cn('size-4', active(href) && 'text-champagne')} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-line pt-4">
      <p className="px-3 text-xs text-dim">Signed in as</p>
      <p className="px-3 text-sm font-medium text-ink">{adminName}</p>
      <button type="button" onClick={logout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mist hover:bg-white/[0.04] hover:text-ink">
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
      <Link href="/" className="mt-1 block rounded-xl px-3 py-2 text-xs text-dim hover:text-ink">View public site</Link>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden h-dvh flex-col justify-between border-r border-line bg-midnight/80 p-5 lg:sticky lg:top-0 lg:flex">
        <div className="grid gap-8"><Logo href="/admin" />{nav}</div>
        {footer}
      </aside>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-midnight/90 px-4 backdrop-blur lg:hidden">
        <Logo href="/admin" />
        <button type="button" className="rounded-lg p-2 text-mist" aria-expanded={open} aria-controls="admin-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {open ? <div id="admin-menu" className="grid gap-4 border-b border-line bg-midnight p-4 lg:hidden">{nav}{footer}</div> : null}
      <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
