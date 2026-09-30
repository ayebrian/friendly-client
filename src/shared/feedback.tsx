import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Avatar as AvatarPrimitive, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="my-4">
      <AlertCircle />
      <AlertDescription>
        <p>{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Повторить
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function Loading({ children = 'Загружаем…' }: { children?: ReactNode }) {
  return (
    <div className="space-y-6 py-8" role="status">
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

export function Avatar({ name }: { name: string }) {
  return (
    <AvatarPrimitive className="avatar" aria-hidden="true">
      <AvatarFallback className="text-sm font-medium">
        {name.trim().slice(0, 1).toLocaleUpperCase('ru') || '?'}
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
