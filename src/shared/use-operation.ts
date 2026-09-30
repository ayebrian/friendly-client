import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

/** Cancel form operations on unmount as well as on session end. */
export function useOperation<T, V = void>(
  operation: (value: V, signal: AbortSignal) => Promise<T>,
) {
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((c) => c.abort());
      active.clear();
    };
  }, []);
  return useMutation({
    mutationFn: async (value: V) => {
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const result = await operation(value, controller.signal);
        controller.signal.throwIfAborted();
        return result;
      } finally {
        controllers.current.delete(controller);
      }
    },
  });
}
