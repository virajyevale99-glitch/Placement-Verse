import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/guard';
import { serverEnv } from '@/lib/env';
import { Logo } from '@/components/site/logo';
import { LoginForm } from '@/components/admin/login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await getSession()) redirect('/admin');
  const { expired } = await searchParams;
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-10 font-display text-3xl font-semibold text-ink">Admin sign in</h1>
        <p className="mt-2 text-sm text-mist">For placement coordinators only.</p>
        <LoginForm expired={expired === '1'} demoMode={serverEnv.demoMode} />
      </div>
    </main>
  );
}
