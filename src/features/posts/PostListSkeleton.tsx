import { Skeleton } from '../../shared/ui/skeleton';

export function PostListSkeleton({
  count = 4,
  label = 'Loading posts',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="post-skeleton-list" role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="post-card post-skeleton" key={index}>
            <Skeleton className="size-10 rounded-full" />
            <div className="post-content">
              <div className="post-header">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="post-skeleton-text">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-11/12" />
                {index % 2 === 0 && <Skeleton className="h-3.5 w-2/3" />}
              </div>
              <div className="post-skeleton-actions">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
