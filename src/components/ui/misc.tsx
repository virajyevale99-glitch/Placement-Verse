import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-indigo-deep', className)} {...props} />;
}

export function Badge({ className, tone = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'mint' | 'champagne' | 'violet' | 'danger' }) {
  const tones = {
    default: 'bg-white/5 text-mist border-line',
    mint: 'bg-mint/10 text-mint border-mint/25',
    champagne: 'bg-champagne/10 text-champagne border-champagne/25',
    violet: 'bg-violet/15 text-violet-200 border-violet/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-xl', className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-mist">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: React.ReactNode }) {
  const tones = {
    info: 'border-blue/30 bg-blue/10 text-blue-100',
    error: 'border-danger/30 bg-danger/10 text-red-100',
    success: 'border-mint/30 bg-mint/10 text-emerald-100',
  } as const;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}
