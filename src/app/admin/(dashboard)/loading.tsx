import { Skeleton } from '@/components/ui/misc';

export default function AdminLoading() {
  return (
    <div>
      <span className="sr-only" role="status">Loading</span>
      <Skeleton className="h-9 w-64" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}
