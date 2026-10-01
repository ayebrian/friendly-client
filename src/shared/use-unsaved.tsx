import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog';

/** One guard for router/history navigation, explicit cancellation and closing the tab. */
export function useUnsavedChanges(dirty: boolean) {
  const leaving = useRef(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);

  const stay = () => {
    setDiscardAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  };
  return {
    confirmDiscard(action: () => void) {
      if (dirty) setDiscardAction(() => action);
      else action();
    },
    confirmation: (
      <AlertDialog
        open={blocker.state === 'blocked' || !!discardAction}
        onOpenChange={(open) => {
          if (!open) stay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes have not been saved. Keep editing to avoid losing them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                leaving.current = true;
                if (blocker.state === 'blocked') blocker.proceed();
                else discardAction?.();
                setDiscardAction(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
