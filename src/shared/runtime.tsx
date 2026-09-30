import { createContext, useContext } from 'react';
import type { FriendlyGateway } from '../domain/gateway';

export interface Runtime {
  gateway: FriendlyGateway;
  isDemo: boolean;
  logout: () => void;
  simulate?: () => void;
}

export const RuntimeContext = createContext<Runtime | null>(null);
export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('Runtime provider is missing');
  return runtime;
}
