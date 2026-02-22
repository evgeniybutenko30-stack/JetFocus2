import { Skeleton } from '@/components/ui/skeleton';

export function AdminTableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
          {Array.from({ length: cols - 1 }).map((__, j) => (
            <Skeleton key={j} className={`h-4 rounded ${j === 0 ? 'w-32' : j === 1 ? 'w-24' : 'w-16'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminCardSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border border-border/40 rounded-2xl p-5 space-y-3">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}
