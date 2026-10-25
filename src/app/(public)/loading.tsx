import { Container } from '@/components/site/section';
import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <Container className="pt-20">
      <span className="sr-only" role="status">Loading placements</span>
      <Skeleton className="h-14 w-2/3 max-w-xl" />
      <Skeleton className="mt-4 h-5 w-1/2 max-w-md" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}
      </div>
    </Container>
  );
}
