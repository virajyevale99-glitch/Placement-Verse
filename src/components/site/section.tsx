import { cn } from '@/lib/utils';

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6', className)}>{children}</div>;
}

export function PageHeader({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <Container className="pb-8 pt-14 sm:pt-20">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">{title}</h1>
          {lead ? <p className="mt-4 text-lg leading-relaxed text-mist">{lead}</p> : null}
        </div>
        {children}
      </div>
    </Container>
  );
}

export function SectionTitle({ title, lead, action, id }: { title: string; lead?: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <h2 id={id} className="font-display text-3xl font-semibold text-ink">{title}</h2>
        {lead ? <p className="mt-2 text-mist">{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}
