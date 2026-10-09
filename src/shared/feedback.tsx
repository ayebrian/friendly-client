import { AlertCircle } from 'lucide-react';
import { cn } from './lib/utils';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Avatar as AvatarPrimitive, AvatarFallback, AvatarImage } from './ui/avatar';
import type { FileDescriptor } from '../domain/models';
import { useRuntime } from './runtime';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export function ErrorNotice({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={cn('my-4', className)}>
      <AlertCircle />
      <AlertDescription>
        <p>{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div className="space-y-3 py-4" role="status">
      <span className="muted text-sm">{children}</span>
      <div className="flex gap-4" aria-hidden="true">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function Avatar({ name, file }: { name: string; file?: FileDescriptor | null }) {
  const { gateway } = useRuntime();
  return (
    <AvatarPrimitive className="avatar" aria-hidden="true">
      {file && <AvatarImage src={gateway.fileUrl(file)} alt="" width={80} height={80} />}
      <AvatarFallback className="text-sm font-medium">
        {name.trim().slice(0, 1).toLocaleUpperCase('en') || '?'}
      </AvatarFallback>
    </AvatarPrimitive>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
